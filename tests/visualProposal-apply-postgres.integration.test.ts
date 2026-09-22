import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../server/src/index.js';
import { db } from '../server/src/db.js';
import type { AiProvider, AiResult } from '../server/src/aiProvider.js';

class ApplyProvider implements AiProvider {
  calls = 0;
  async generate(): Promise<AiResult> { this.calls += 1; return { assistantText: 'Proposta pronta.', proposedActions: [
    { type: 'CREATE_NODE', clientActionId: 'apply-task', nodeType: 'TASK', title: 'Título seguro', content: 'Conteúdo como texto' },
    { type: 'CREATE_NODE', clientActionId: 'apply-decision', nodeType: 'DECISION', title: 'Decisão segura', content: 'Escolher caminho' },
  ] }; }
}

type JsonResponse = { response: Response; json: any };
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let baseUrl = '';
async function request(path: string, init: RequestInit = {}, session?: string): Promise<JsonResponse> {
  const headers = new Headers(init.headers); headers.set('content-type', 'application/json'); if (session) headers.set('cookie', session);
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers }); return { response, json: response.status === 204 ? undefined : await response.json() };
}
function cookie(response: Response) { return response.headers.get('set-cookie')!.split(';', 1)[0]; }

describe('safe visual proposal application', () => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const emailA = `apply-a-${suffix}@example.com`; const emailB = `apply-b-${suffix}@example.com`;
  let cookieA = ''; let cookieB = ''; let projectA = ''; let projectB = ''; let provider: ApplyProvider;
  beforeAll(async () => {
    await db.$connect(); provider = new ApplyProvider(); const app = createApp({ aiProvider: provider }); server = app.listen(0); await new Promise<void>(resolve => server.once('listening', resolve)); baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    cookieA = cookie((await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Apply A', email: emailA, password: 'A-secure-password-123' }) })).response);
    cookieB = cookie((await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: 'Apply B', email: emailB, password: 'B-secure-password-123' }) })).response);
    projectA = (await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Apply A' }) }, cookieA)).json.project.id;
    projectB = (await request('/api/projects', { method: 'POST', body: JSON.stringify({ name: 'Apply B' }) }, cookieB)).json.project.id;
  });
  afterAll(async () => { await db.project.deleteMany({ where: { id: { in: [projectA, projectB] } } }); await db.profile.deleteMany({ where: { email: { in: [emailA, emailB] } } }); await new Promise<void>(resolve => server.close(() => resolve())); await db.$disconnect(); });

  async function createProposal(projectId = projectA, session = cookieA) {
    const conversation = await request(`/api/projects/${projectId}/conversations`, { method: 'POST', body: '{}' }, session);
    const conversationId = conversation.json.conversation.id;
    const sent = await request(`/api/projects/${projectId}/conversations/${conversationId}/messages`, { method: 'POST', body: JSON.stringify({ content: 'Crie blocos no canvas', contextNodeIds: [] }) }, session);
    return { conversationId, proposalId: sent.json.assistantMessage.visualProposal.id };
  }

  it('applies all canonical actions atomically, preserves fields, audits mapping and lays out an empty project', async () => {
    const { proposalId } = await createProposal(); const tampered = await request(`/api/projects/${projectA}/visual-proposals/${proposalId}/apply`, { method: 'POST', body: JSON.stringify({ title: 'tampered', nodeType: 'FILE', projectId: projectB, createdBy: 'bad' }) }, cookieA); expect(tampered.response.status).toBe(400);
    const applied = await request(`/api/projects/${projectA}/visual-proposals/${proposalId}/apply`, { method: 'POST', body: JSON.stringify({}) }, cookieA);
    expect(applied.response.status).toBe(200); expect(applied.json.proposal.status).toBe('APPLIED'); expect(applied.json.proposal.appliedAt).toBeTruthy(); expect(applied.json.proposal.appliedByProfileId).toBeTruthy(); expect(applied.json.nodes).toHaveLength(2);
    expect(applied.json.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'task', title: 'Título seguro', content: 'Conteúdo como texto', positionX: 120, positionY: 120, width: 240, height: 160 }), expect.objectContaining({ type: 'decision', positionX: 400, positionY: 120 })]));
    const mappings = await db.visualProposalAction.findMany({ where: { proposalId }, orderBy: { clientActionId: 'asc' } }); expect(mappings).toHaveLength(2); expect(mappings.every(mapping => mapping.protocolVersion === '1.0')).toBe(true); expect(new Set(mappings.map(mapping => mapping.nodeId)).size).toBe(2);
    expect(provider.calls).toBe(1);
  });

  it('is idempotent for retries, double clicks and concurrent requests', async () => {
    const { proposalId } = await createProposal(); const path = `/api/projects/${projectA}/visual-proposals/${proposalId}/apply`; const responses = await Promise.all([1, 2, 3].map(() => request(path, { method: 'POST', body: '{}' }, cookieA)));
    expect(responses.every(item => item.response.status === 200)).toBe(true); const nodes = await db.canvasNode.findMany({ where: { projectId: projectA, sourceType: 'visual_proposal', metadata: { path: ['proposalId'], equals: proposalId } } }); expect(nodes).toHaveLength(2); const retry = await request(path, { method: 'POST', body: '{}' }, cookieA); expect(retry.json.nodes).toHaveLength(2);
  });

  it('places a later batch after existing bounds without overlapping within the batch', async () => {
    await request(`/api/projects/${projectA}/nodes`, { method: 'POST', body: JSON.stringify({ type: 'note', title: 'Existing', positionX: 100, positionY: 300, width: 500, height: 300 }) }, cookieA);
    const { proposalId } = await createProposal(); const result = await request(`/api/projects/${projectA}/visual-proposals/${proposalId}/apply`, { method: 'POST', body: '{}' }, cookieA); expect(result.response.status).toBe(200); const [first, second] = result.json.nodes; expect(first.positionX).toBeGreaterThanOrEqual(680); expect(first.positionY).toBe(440); expect(second.positionX - first.positionX).toBe(280);
  });

  it('rejects, is idempotent, and never creates nodes', async () => {
    const { proposalId } = await createProposal(); const path = `/api/projects/${projectA}/visual-proposals/${proposalId}/reject`; const first = await request(path, { method: 'POST', body: '{}' }, cookieA); const second = await request(path, { method: 'POST', body: '{}' }, cookieA); expect(first.response.status).toBe(200); expect(second.response.status).toBe(200); expect(second.json.proposal.status).toBe('REJECTED'); expect((await request(`/api/projects/${projectA}/visual-proposals/${proposalId}/apply`, { method: 'POST', body: '{}' }, cookieA)).response.status).toBe(409); expect(await db.visualProposalAction.count({ where: { proposalId } })).toBe(0);
  });

  it('enforces project and membership isolation', async () => {
    const { proposalId } = await createProposal(); expect((await request(`/api/projects/${projectB}/visual-proposals/${proposalId}/apply`, { method: 'POST', body: '{}' }, cookieB)).response.status).toBe(404); expect((await request(`/api/projects/${projectA}/visual-proposals/${proposalId}/apply`, { method: 'POST', body: '{}' }, cookieB)).response.status).toBe(404);
  });

  it('rolls back fully when the stored payload is invalid and never calls the AI provider during application', async () => {
    const { proposalId } = await createProposal(); await db.visualProposal.update({ where: { id: proposalId }, data: { payload: { protocolVersion: '1.0', assistantText: 'bad', proposedActions: [{ type: 'DELETE_NODE' }] } } }); const beforeCalls = provider.calls; const response = await request(`/api/projects/${projectA}/visual-proposals/${proposalId}/apply`, { method: 'POST', body: '{}' }, cookieA); expect(response.response.status).toBe(409); expect(provider.calls).toBe(beforeCalls); expect(await db.canvasNode.count({ where: { projectId: projectA, sourceType: 'visual_proposal', metadata: { path: ['proposalId'], equals: proposalId } } })).toBe(0); expect((await db.visualProposal.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe('PENDING');
  });
});
