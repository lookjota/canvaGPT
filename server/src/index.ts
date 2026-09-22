import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { db } from './db.js';
import { env } from './env.js';
import { hashPassword, requireAuth, requireProjectMember, setSession, verifyPassword } from './auth.js';
import { assertContextLimits, buildConversationContext } from './contextBuilder.js';
import { createAiProvider, MockAiProvider, type AiProvider } from './aiProvider.js';
import { projectMemoryCreateInput, projectMemoryKind, projectMemoryUpdateInput } from './projectMemory.js';

export function createApp(options: { aiProvider?: AiProvider } = {}) {
const app = express();
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
const asyncRoute = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = z.string().uuid();
const getAiProviderErrorDetails = (error: unknown) => {
  const details = error instanceof Error ? { name: error.name, message: error.message } : { name: 'UnknownError' };
  if (!error || typeof error !== 'object') return details;
  const providerError = error as { status?: unknown; code?: unknown; type?: unknown; requestID?: unknown; requestId?: unknown };
  return {
    ...details,
    ...(typeof providerError.status === 'number' ? { status: providerError.status } : {}),
    ...(typeof providerError.code === 'string' ? { code: providerError.code } : {}),
    ...(typeof providerError.type === 'string' ? { type: providerError.type } : {}),
    ...(typeof providerError.requestID === 'string' ? { requestId: providerError.requestID } : {}),
    ...(typeof providerError.requestId === 'string' ? { requestId: providerError.requestId } : {}),
  };
};

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(80), email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(8).max(200) }).parse(req.body);
  const exists = await db.profile.findUnique({ where: { email: input.email } });
  if (exists) return res.status(409).json({ error: 'EMAIL_IN_USE' });
  const passwordHash = await hashPassword(input.password);
  const user = await db.profile.create({ data: { name: input.name, email: input.email, passwordHash } });
  setSession(res, user.id); res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const input = z.object({ email: z.string().email().transform(v => v.toLowerCase()), password: z.string() }).parse(req.body);
  const user = await db.profile.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
  setSession(res, user.id); res.json({ user: { id: user.id, name: user.name, email: user.email } });
}));
app.post('/api/auth/logout', (_req, res) => { res.clearCookie('orion_session'); res.status(204).end(); });
app.get('/api/auth/me', requireAuth, asyncRoute(async (req, res) => { const user = await db.profile.findUniqueOrThrow({ where: { id: req.userId } }); res.json({ user: { id: user.id, name: user.name, email: user.email } }); }));

app.get('/api/projects', requireAuth, asyncRoute(async (req, res) => {
  const projects = await db.project.findMany({ where: { members: { some: { userId: req.userId } } }, orderBy: { updatedAt: 'desc' } }); res.json({ projects });
}));
app.post('/api/projects', requireAuth, asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(100), description: z.string().max(500).optional() }).parse(req.body);
  const project = await db.project.create({ data: { ...input, ownerId: req.userId!, members: { create: { userId: req.userId!, role: 'owner' } } } }); res.status(201).json({ project });
}));
app.get('/api/projects/:projectId', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' });
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId }, include: { nodes: true, edges: true } }); const viewState = await db.projectViewState.findUnique({ where: { projectId_userId: { projectId, userId: req.userId! } } }); res.json({ project, viewState });
}));
app.patch('/api/projects/:projectId', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' });
  const input = z.object({ name: z.string().trim().min(1).max(100).optional(), description: z.string().max(500).nullable().optional(), isArchived: z.boolean().optional() }).parse(req.body); res.json({ project: await db.project.update({ where: { id: projectId }, data: input }) });
}));
app.delete('/api/projects/:projectId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); const member = await requireProjectMember(projectId, req.userId!, true); if (!member || member.role !== 'owner') return res.status(404).json({ error: 'NOT_FOUND' }); await db.project.delete({ where: { id: projectId } }); res.status(204).end(); }));

const nodeInput = z.object({ type: z.enum(['note','task','decision','document','prompt','file']), title: z.string().min(1).max(200), content: z.string().max(100000).default(''), positionX: z.number().finite().default(120), positionY: z.number().finite().default(120), width: z.number().min(160).max(1200).default(240), height: z.number().min(100).max(1000).default(160), status: z.string().max(40).nullable().optional(), tags: z.array(z.string().max(40)).max(20).default([]) });
app.post('/api/projects/:projectId/nodes', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = nodeInput.parse(req.body); const node = await db.canvasNode.create({ data: { ...input, projectId, createdBy: req.userId! } }); res.status(201).json({ node }); }));
app.patch('/api/projects/:projectId/nodes/:nodeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const nodeId = id.parse(req.params.nodeId); const input = nodeInput.partial().parse(req.body); const node = await db.canvasNode.updateMany({ where: { id: nodeId, projectId }, data: input }); if (!node.count) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ node: await db.canvasNode.findUniqueOrThrow({ where: { id: nodeId } }) }); }));
app.delete('/api/projects/:projectId/nodes/:nodeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const result = await db.canvasNode.deleteMany({ where: { id: id.parse(req.params.nodeId), projectId } }); if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' }); res.status(204).end(); }));
const relationType = z.enum(['related_to','depends_on','generates','derived_from','supports','contradicts','blocks','references']);
app.post('/api/projects/:projectId/edges', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = z.object({ sourceNodeId: id, targetNodeId: id, relationType, label: z.string().max(100).nullable().optional() }).parse(req.body); const nodes = await db.canvasNode.findMany({ where: { id: { in: [input.sourceNodeId, input.targetNodeId] }, projectId }, select: { id: true } }); if (nodes.length !== 2 || input.sourceNodeId === input.targetNodeId) return res.status(400).json({ error: 'INVALID_EDGE' }); try { const edge = await db.canvasEdge.create({ data: { ...input, projectId } }); res.status(201).json({ edge }); } catch (error) { if ((error as { code?: string }).code === 'P2002') return res.status(409).json({ error: 'EDGE_EXISTS' }); throw error; } }));
app.patch('/api/projects/:projectId/edges/:edgeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = z.object({ relationType, label: z.string().max(100).nullable().optional() }).partial().parse(req.body); try { const edge = await db.canvasEdge.updateMany({ where: { id: id.parse(req.params.edgeId), projectId }, data: input }); if (!edge.count) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ edge: await db.canvasEdge.findUniqueOrThrow({ where: { id: id.parse(req.params.edgeId) } }) }); } catch (error) { if ((error as { code?: string }).code === 'P2002') return res.status(409).json({ error: 'EDGE_EXISTS' }); throw error; } }));
app.delete('/api/projects/:projectId/edges/:edgeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const result = await db.canvasEdge.deleteMany({ where: { id: id.parse(req.params.edgeId), projectId } }); if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' }); res.status(204).end(); }));

const memoryInclude = { creator: { select: { id: true, name: true } } } as const;
app.get('/api/projects/:projectId/memories', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId);
  if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' });
  const kind = req.query.kind === undefined ? undefined : projectMemoryKind.parse(req.query.kind);
  const archived = req.query.archived === undefined ? false : z.enum(['true', 'false']).parse(req.query.archived) === 'true';
  const memories = await db.projectMemory.findMany({ where: { projectId, ...(kind ? { kind } : {}), status: archived ? 'ARCHIVED' : 'ACTIVE' }, orderBy: { updatedAt: 'desc' }, include: memoryInclude });
  res.json({ memories });
}));
app.post('/api/projects/:projectId/memories', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId);
  if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' });
  const input = projectMemoryCreateInput.parse(req.body);
  const memory = await db.projectMemory.create({ data: { ...input, projectId, createdBy: req.userId! }, include: memoryInclude });
  res.status(201).json({ memory });
}));
app.patch('/api/projects/:projectId/memories/:memoryId', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId);
  if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' });
  const memoryId = id.parse(req.params.memoryId);
  const input = projectMemoryUpdateInput.parse(req.body);
  const result = await db.projectMemory.updateMany({ where: { id: memoryId, projectId }, data: input });
  if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ memory: await db.projectMemory.findUniqueOrThrow({ where: { id: memoryId }, include: memoryInclude }) });
}));
app.post('/api/projects/:projectId/memories/:memoryId/archive', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId);
  if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' });
  const memoryId = id.parse(req.params.memoryId);
  const result = await db.projectMemory.updateMany({ where: { id: memoryId, projectId }, data: { status: 'ARCHIVED', archivedAt: new Date() } });
  if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ memory: await db.projectMemory.findUniqueOrThrow({ where: { id: memoryId }, include: memoryInclude }) });
}));
app.post('/api/projects/:projectId/memories/:memoryId/restore', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId);
  if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' });
  const memoryId = id.parse(req.params.memoryId);
  const result = await db.projectMemory.updateMany({ where: { id: memoryId, projectId }, data: { status: 'ACTIVE', archivedAt: null } });
  if (!result.count) return res.status(404).json({ error: 'NOT_FOUND' });
  res.json({ memory: await db.projectMemory.findUniqueOrThrow({ where: { id: memoryId }, include: memoryInclude }) });
}));

const conversationFor = (projectId: string, conversationId: string, userId: string) => db.conversation.findFirst({ where: { id: conversationId, projectId, userId } });
const messageInput = z.object({ content: z.string().trim().min(1).max(8000), contextNodeIds: z.array(id).max(20).default([]) });
const conversationInclude = { messages: { orderBy: { createdAt: 'asc' as const }, include: { contextNodes: { orderBy: { titleSnapshot: 'asc' as const } } } } };
app.post('/api/projects/:projectId/conversations', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = z.object({ title: z.string().trim().max(120).optional() }).parse(req.body ?? {}); const conversation = await db.conversation.create({ data: { projectId, userId: req.userId!, title: input.title }, include: conversationInclude }); res.status(201).json({ conversation }); }));
app.get('/api/projects/:projectId/conversations', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' }); const conversations = await db.conversation.findMany({ where: { projectId, userId: req.userId! }, orderBy: { updatedAt: 'desc' }, include: { _count: { select: { messages: true } } } }); res.json({ conversations }); }));
app.get('/api/projects/:projectId/conversations/:conversationId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' }); const conversation = await conversationFor(projectId, id.parse(req.params.conversationId), req.userId!); if (!conversation) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ conversation: await db.conversation.findUniqueOrThrow({ where: { id: conversation.id }, include: conversationInclude }) }); }));
app.post('/api/projects/:projectId/conversations/:conversationId/messages', requireAuth, asyncRoute(async (req, res) => {
  const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' });
  const conversationId = id.parse(req.params.conversationId); const conversation = await conversationFor(projectId, conversationId, req.userId!); if (!conversation) return res.status(404).json({ error: 'NOT_FOUND' });
  const input = messageInput.parse(req.body); const uniqueIds = [...new Set(input.contextNodeIds)];
  const nodes = await db.canvasNode.findMany({ where: { projectId, id: { in: uniqueIds } }, select: { id: true, type: true, title: true, content: true } });
  if (nodes.length !== uniqueIds.length) return res.status(400).json({ error: 'INVALID_CONTEXT_NODES' });
  const edges = await db.canvasEdge.findMany({ where: { projectId, sourceNodeId: { in: uniqueIds }, targetNodeId: { in: uniqueIds } }, select: { sourceNodeId: true, targetNodeId: true, relationType: true, label: true } });
  const context = buildConversationContext(nodes, edges); try { assertContextLimits(uniqueIds, nodes, context.text); } catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'CONTEXT_INVALID' }); }
  const history = (await db.message.findMany({ where: { conversationId, role: { in: ['user', 'assistant'] } }, orderBy: { createdAt: 'asc' }, take: 20, select: { role: true, content: true } })).map(message => ({ role: message.role as 'user' | 'assistant', content: message.content }));
  const userMessage = await db.message.create({ data: { conversationId, role: 'user', content: input.content, contextNodeIds: uniqueIds, contextNodes: { create: nodes.map(node => ({ nodeId: node.id, titleSnapshot: node.title, typeSnapshot: node.type, contentSnapshot: node.content })) } }, include: { contextNodes: true } });
  try {
    const result = await (options.aiProvider ?? createAiProvider()).generate({ message: input.content, history, context: uniqueIds.length ? context.text : '' });
    const assistant = await db.$transaction(async tx => { const message = await tx.message.create({ data: { conversationId, role: 'assistant', content: result.content } }); await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }); return message; });
    res.status(201).json({ userMessage, assistantMessage: assistant });
  } catch (error) { console.error('AI provider failed', getAiProviderErrorDetails(error)); res.status(502).json({ error: 'AI_PROVIDER_FAILED', messageId: userMessage.id }); }
}));
app.put('/api/projects/:projectId/view-state', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = z.object({ viewportX: z.number().finite(), viewportY: z.number().finite(), zoom: z.number().min(.25).max(2.5), rightPanelOpen: z.boolean().optional(), rightPanelWidth: z.number().min(280).max(600).optional() }).parse(req.body); const viewState = await db.projectViewState.upsert({ where: { projectId_userId: { projectId, userId: req.userId! } }, create: { projectId, userId: req.userId!, ...input }, update: input }); res.json({ viewState }); }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues });
  const prismaError = err as { code?: unknown };
  if (prismaError.code === 'P2002') return res.status(409).json({ error: 'EMAIL_IN_USE' });
  console.error(err instanceof Error ? err.name : 'Unknown server error');
  res.status(500).json({ error: 'INTERNAL_ERROR' });
});

if (process.env.NODE_ENV !== 'test') app.listen(env.PORT, () => console.log(`Orion API listening on http://localhost:${env.PORT}`));
return app;
}

export const app = createApp({ aiProvider: process.env.NODE_ENV === 'test' ? new MockAiProvider() : undefined });
