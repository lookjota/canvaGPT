import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { app } from '../server/src/index.js';
import { db } from '../server/src/db.js';

type JsonResponse = { json: unknown; response: Response };

let server: ReturnType<typeof app.listen>;
let baseUrl: string;

async function request(path: string, init: RequestInit = {}, cookie?: string): Promise<JsonResponse> {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return { response, json: response.status === 204 ? undefined : await response.json() };
}

function sessionCookie(response: Response) {
  const setCookie = response.headers.get('set-cookie');
  expect(setCookie).toBeTruthy();
  return setCookie!.split(';', 1)[0];
}

describe('auth and PostgreSQL persistence', () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const passwordA = 'A-secure-password-123';
  const passwordB = 'B-secure-password-123';
  const emailA = `orion-a-${suffix}@example.com`;
  const emailB = `orion-b-${suffix}@example.com`;
  let cookieA: string;
  let cookieB: string;
  let projectId: string;
  let nodeId: string;
  let secondNodeId: string;

  beforeAll(async () => {
    await db.$connect();
    server = app.listen(0);
    await new Promise<void>(resolve => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    if (projectId) await db.project.delete({ where: { id: projectId } }).catch(() => undefined);
    await db.profile.deleteMany({ where: { email: { in: [emailA, emailB] } } }).catch(() => undefined);
    await new Promise<void>(resolve => server?.close(() => resolve()));
    await db.$disconnect();
  });

  it('registers without persisting or exposing plaintext credentials', async () => {
    const registered = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'User A', email: emailA, password: passwordA }) });
    expect(registered.response.status).toBe(201);
    expect(registered.json).not.toHaveProperty('password');
    expect(registered.json).not.toHaveProperty('passwordHash');
    cookieA = sessionCookie(registered.response);

    const stored = await db.profile.findUniqueOrThrow({ where: { email: emailA } });
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.passwordHash).not.toBe(passwordA);
    expect(stored).not.toHaveProperty('password');

    const duplicate = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Duplicate', email: emailA, password: passwordA }) });
    expect(duplicate.response.status).toBe(409);
    expect(duplicate.json).toEqual({ error: 'EMAIL_IN_USE' });
  });

  it('authenticates, exposes only public user data, and logs out', async () => {
    const wrongPassword = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: emailA, password: 'wrong-password' }) });
    expect(wrongPassword.response.status).toBe(401);

    const missingUser = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: `missing-${suffix}@example.com`, password: passwordA }) });
    expect(missingUser.response.status).toBe(401);

    const login = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: emailA, password: passwordA }) });
    expect(login.response.status).toBe(200);
    expect(login.json).not.toHaveProperty('password');
    expect(login.json).not.toHaveProperty('passwordHash');
    cookieA = sessionCookie(login.response);
    expect(login.response.headers.get('set-cookie')).toContain('HttpOnly');

    const me = await request('/api/auth/me', {}, cookieA);
    expect(me.response.status).toBe(200);
    expect(me.json).not.toHaveProperty('password');
    expect(me.json).not.toHaveProperty('passwordHash');

    const logout = await request('/api/auth/logout', { method: 'POST' }, cookieA);
    expect(logout.response.status).toBe(204);
    const afterLogout = await request('/api/auth/me');
    expect(afterLogout.response.status).toBe(401);
  });

  it('isolates projects, nodes, and personal viewport state between users', async () => {
    const registeredB = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'User B', email: emailB, password: passwordB }) });
    expect(registeredB.response.status).toBe(201);
    cookieB = sessionCookie(registeredB.response);

    const createdProject = await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Project A', description: 'Round trip' }) }, cookieA);
    expect(createdProject.response.status).toBe(201);
    projectId = (createdProject.json as { project: { id: string } }).project.id;

    const createdNode = await request(`/api/projects/${projectId}/nodes`, { method: 'POST', body: JSON.stringify({ type: 'note', title: 'Node A', content: 'Content A', positionX: 10, positionY: 20, width: 300, height: 180 }) }, cookieA);
    expect(createdNode.response.status).toBe(201);
    nodeId = (createdNode.json as { node: { id: string } }).node.id;
    const createdSecondNode = await request(`/api/projects/${projectId}/nodes`, { method: 'POST', body: JSON.stringify({ type: 'task', title: 'Node B' }) }, cookieA);
    expect(createdSecondNode.response.status).toBe(201);
    secondNodeId = (createdSecondNode.json as { node: { id: string } }).node.id;

    const stressNodes: Array<{ type: 'note' | 'task' | 'decision'; title: string }> = [
      { type: 'note', title: 'Note 1' }, { type: 'note', title: 'Note 2' }, { type: 'note', title: 'Note 3' },
      { type: 'task', title: 'Task 1' }, { type: 'task', title: 'Task 2' },
      { type: 'decision', title: 'Decision 1' }, { type: 'decision', title: 'Decision 2' },
    ];
    const stressIds: string[] = [];
    for (const [index, item] of stressNodes.entries()) {
      const created = await request(`/api/projects/${projectId}/nodes`, { method: 'POST', body: JSON.stringify({ ...item, content: 'initial', positionX: index, positionY: index, width: 240, height: 160 }) }, cookieA);
      expect(created.response.status).toBe(201);
      stressIds.push((created.json as { node: { id: string } }).node.id);
    }
    for (const [index, stressId] of stressIds.entries()) {
      for (const revision of [1, 2, 3]) {
        const update = await request(`/api/projects/${projectId}/nodes/${stressId}`, { method: 'PATCH', body: JSON.stringify({ title: `${stressNodes[index].title} v${revision}`, content: `content ${revision}`, positionX: index * 10 + revision, positionY: index * 20 + revision, width: 240 + revision, height: 160 + revision }) }, cookieA);
        expect(update.response.status).toBe(200);
      }
    }

    const savedView = await request(`/api/projects/${projectId}/view-state`, { method: 'PUT', body: JSON.stringify({ viewportX: 42, viewportY: -18, zoom: 1.25 }) }, cookieA);
    expect(savedView.response.status).toBe(200);

    const readBack = await request(`/api/projects/${projectId}`, {}, cookieA);
    expect(readBack.response.status).toBe(200);
    const project = (readBack.json as { project: { nodes: Array<Record<string, unknown>> }; viewState: Record<string, unknown> }).project;
    expect(project.nodes[0]).toMatchObject({ title: 'Node A', content: 'Content A', positionX: 10, positionY: 20, width: 300, height: 180 });
    for (const [index, stressId] of stressIds.entries()) {
      const persisted = project.nodes.find(node => node.id === stressId);
      expect(persisted).toMatchObject({ id: stressId, projectId, type: stressNodes[index].type, title: `${stressNodes[index].title} v3`, content: 'content 3', positionX: index * 10 + 3, positionY: index * 20 + 3, width: 243, height: 163 });
    }
    expect((readBack.json as { viewState: Record<string, unknown> }).viewState).toMatchObject({ viewportX: 42, viewportY: -18, zoom: 1.25 });

    for (const attempt of [
      request(`/api/projects/${projectId}`, {}, cookieB),
      request(`/api/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ name: 'Hijacked' }) }, cookieB),
      request(`/api/projects/${projectId}`, { method: 'DELETE' }, cookieB),
      request(`/api/projects/${projectId}/nodes`, { method: 'POST', body: JSON.stringify({ type: 'note', title: 'Unauthorized' }) }, cookieB),
      request(`/api/projects/${projectId}/nodes/${nodeId}`, { method: 'PATCH', body: JSON.stringify({ title: 'Hijacked node' }) }, cookieB),
      request(`/api/projects/${projectId}/nodes/${nodeId}`, { method: 'DELETE' }, cookieB),
      request(`/api/projects/${projectId}/view-state`, { method: 'PUT', body: JSON.stringify({ viewportX: 999, viewportY: 999, zoom: 2 }) }, cookieB),
    ]) {
      expect((await attempt).response.status).toBe(404);
    }

    const stillOwned = await request(`/api/projects/${projectId}`, {}, cookieA);
    expect(stillOwned.response.status).toBe(200);
    expect((stillOwned.json as { project: { name: string; nodes: Array<{ title: string }> }; viewState: { viewportX: number; viewportY: number; zoom: number } }).project).toMatchObject({ name: 'Project A' });
    expect((stillOwned.json as { project: { nodes: Array<{ title: string }> } }).project.nodes[0].title).toBe('Node A');
    expect((stillOwned.json as { viewState: { viewportX: number; viewportY: number; zoom: number } }).viewState).toMatchObject({ viewportX: 42, viewportY: -18, zoom: 1.25 });
  });

  it('persists semantic edges, rejects duplicates and protects project boundaries', async () => {
    const created = await request(`/api/projects/${projectId}/edges`, { method: 'POST', body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId: secondNodeId, relationType: 'supports' }) }, cookieA);
    expect(created.response.status).toBe(201);
    const edgeId = (created.json as { edge: { id: string } }).edge.id;
    const duplicate = await request(`/api/projects/${projectId}/edges`, { method: 'POST', body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId: secondNodeId, relationType: 'supports' }) }, cookieA);
    expect(duplicate.response.status).toBe(409);
    const changed = await request(`/api/projects/${projectId}/edges/${edgeId}`, { method: 'PATCH', body: JSON.stringify({ relationType: 'generates' }) }, cookieA);
    expect(changed.response.status).toBe(200);
    const reloaded = await request(`/api/projects/${projectId}`, {}, cookieA);
    expect((reloaded.json as { project: { edges: Array<{ id: string; relationType: string }> } }).project.edges).toContainEqual(expect.objectContaining({ id: edgeId, relationType: 'generates' }));
    expect((await request(`/api/projects/${projectId}/edges`, { method: 'POST', body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId: secondNodeId, relationType: 'blocks' }) }, cookieB)).response.status).toBe(404);
    expect((await request(`/api/projects/${projectId}/edges/${edgeId}`, { method: 'DELETE' }, cookieA)).response.status).toBe(204);
    const afterDelete = await request(`/api/projects/${projectId}`, {}, cookieA);
    expect((afterDelete.json as { project: { edges: Array<{ id: string }> } }).project.edges).not.toContainEqual(expect.objectContaining({ id: edgeId }));
  });

  it('persists contextual conversations, snapshots, internal edges and ownership boundaries', async () => {
    const contextEdge = await request(`/api/projects/${projectId}/edges`, { method: 'POST', body: JSON.stringify({ sourceNodeId: nodeId, targetNodeId: secondNodeId, relationType: 'supports' }) }, cookieA);
    expect(contextEdge.response.status).toBe(201);
    const conversation = await request(`/api/projects/${projectId}/conversations`, { method: 'POST', body: JSON.stringify({ title: 'Riscos' }) }, cookieA);
    expect(conversation.response.status).toBe(201);
    const conversationId = (conversation.json as { conversation: { id: string } }).conversation.id;
    const sent = await request(`/api/projects/${projectId}/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'Analise a relação', contextNodeIds: [nodeId, secondNodeId] }) }, cookieA);
    expect(sent.response.status).toBe(201);
    expect(sent.json).toMatchObject({ userMessage: { role: 'user', content: 'Analise a relação' }, assistantMessage: { role: 'assistant' } });
    const savedUserMessage = (sent.json as { userMessage: { id: string; contextNodes: Array<{ titleSnapshot: string; contentSnapshot: string }> } }).userMessage;
    expect(savedUserMessage.contextNodes).toHaveLength(2);
    await request(`/api/projects/${projectId}/nodes/${nodeId}`, { method: 'PATCH', body: JSON.stringify({ title: 'Node A editado', content: 'Novo conteúdo' }) }, cookieA);
    const reloaded = await request(`/api/projects/${projectId}/conversations/${conversationId}`, {}, cookieA);
    expect(reloaded.response.status).toBe(200);
    const messages = (reloaded.json as { conversation: { messages: Array<{ role: string; contextNodes: Array<{ titleSnapshot: string; contentSnapshot: string }> }> } }).conversation.messages;
    expect(messages[0].contextNodes[0]).toMatchObject({ titleSnapshot: 'Node A', contentSnapshot: 'Content A' });
    expect((await request(`/api/projects/${projectId}/conversations/${conversationId}`, {}, cookieB)).response.status).toBe(404);
    const invalidNode = await request(`/api/projects/${projectId}/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'invalid', contextNodeIds: ['11111111-1111-4111-8111-111111111111'] }) }, cookieA);
    expect(invalidNode.response.status).toBe(400);
  });
});
