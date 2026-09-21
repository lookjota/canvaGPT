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

    const savedView = await request(`/api/projects/${projectId}/view-state`, { method: 'PUT', body: JSON.stringify({ viewportX: 42, viewportY: -18, zoom: 1.25 }) }, cookieA);
    expect(savedView.response.status).toBe(200);

    const readBack = await request(`/api/projects/${projectId}`, {}, cookieA);
    expect(readBack.response.status).toBe(200);
    const project = (readBack.json as { project: { nodes: Array<Record<string, unknown>> }; viewState: Record<string, unknown> }).project;
    expect(project.nodes[0]).toMatchObject({ title: 'Node A', content: 'Content A', positionX: 10, positionY: 20, width: 300, height: 180 });
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
});
