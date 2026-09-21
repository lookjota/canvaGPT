import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { db } from './db.js';
import { env } from './env.js';
import { hashPassword, requireAuth, requireProjectMember, setSession, verifyPassword } from './auth.js';

const app = express();
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
const asyncRoute = (fn: express.RequestHandler): express.RequestHandler => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const id = z.string().uuid();

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(1).max(80), email: z.string().email().transform(v => v.toLowerCase()), password: z.string().min(8).max(200) }).parse(req.body);
  const exists = await db.profile.findUnique({ where: { email: input.email } });
  if (exists) return res.status(409).json({ error: 'EMAIL_IN_USE' });
  const user = await db.profile.create({ data: { ...input, passwordHash: await hashPassword(input.password) } });
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

const nodeInput = z.object({ type: z.enum(['note','document','ai_response','task','decision','prompt','file','frame']), title: z.string().min(1).max(200), content: z.string().max(100000).default(''), positionX: z.number().finite().default(120), positionY: z.number().finite().default(120), width: z.number().min(160).max(1200).default(240), height: z.number().min(100).max(1000).default(160), status: z.string().max(40).nullable().optional(), tags: z.array(z.string().max(40)).max(20).default([]) });
app.post('/api/projects/:projectId/nodes', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = nodeInput.parse(req.body); const node = await db.canvasNode.create({ data: { ...input, projectId, createdBy: req.userId! } }); res.status(201).json({ node }); }));
app.patch('/api/projects/:projectId/nodes/:nodeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const nodeId = id.parse(req.params.nodeId); const input = nodeInput.partial().parse(req.body); const node = await db.canvasNode.updateMany({ where: { id: nodeId, projectId }, data: input }); if (!node.count) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ node: await db.canvasNode.findUniqueOrThrow({ where: { id: nodeId } }) }); }));
app.delete('/api/projects/:projectId/nodes/:nodeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); await db.canvasNode.deleteMany({ where: { id: id.parse(req.params.nodeId), projectId } }); res.status(204).end(); }));
app.post('/api/projects/:projectId/edges', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = z.object({ sourceNodeId: id, targetNodeId: id, relationType: z.enum(['related_to','depends_on','generates','derived_from','supports','contradicts','references','next_step']), label: z.string().max(100).nullable().optional() }).parse(req.body); const nodes = await db.canvasNode.findMany({ where: { id: { in: [input.sourceNodeId, input.targetNodeId] }, projectId }, select: { id: true } }); if (nodes.length !== 2 || input.sourceNodeId === input.targetNodeId) return res.status(400).json({ error: 'INVALID_EDGE' }); const edge = await db.canvasEdge.create({ data: { ...input, projectId } }); res.status(201).json({ edge }); }));
app.patch('/api/projects/:projectId/edges/:edgeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = z.object({ relationType: z.enum(['related_to','depends_on','generates','derived_from','supports','contradicts','references','next_step']), label: z.string().max(100).nullable().optional() }).partial().parse(req.body); const edge = await db.canvasEdge.updateMany({ where: { id: id.parse(req.params.edgeId), projectId }, data: input }); if (!edge.count) return res.status(404).json({ error: 'NOT_FOUND' }); res.json({ edge: await db.canvasEdge.findUniqueOrThrow({ where: { id: id.parse(req.params.edgeId) } }) }); }));
app.delete('/api/projects/:projectId/edges/:edgeId', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!, true))) return res.status(404).json({ error: 'NOT_FOUND' }); await db.canvasEdge.deleteMany({ where: { id: id.parse(req.params.edgeId), projectId } }); res.status(204).end(); }));
app.put('/api/projects/:projectId/view-state', requireAuth, asyncRoute(async (req, res) => { const projectId = id.parse(req.params.projectId); if (!(await requireProjectMember(projectId, req.userId!))) return res.status(404).json({ error: 'NOT_FOUND' }); const input = z.object({ viewportX: z.number().finite(), viewportY: z.number().finite(), zoom: z.number().min(.25).max(2.5), rightPanelOpen: z.boolean().optional(), rightPanelWidth: z.number().min(280).max(600).optional() }).parse(req.body); const viewState = await db.projectViewState.upsert({ where: { projectId_userId: { projectId, userId: req.userId! } }, create: { projectId, userId: req.userId!, ...input }, update: input }); res.json({ viewState }); }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => { console.error(err); if (err instanceof z.ZodError) return res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues }); res.status(500).json({ error: 'INTERNAL_ERROR' }); });
app.listen(env.PORT, () => console.log(`Orion API listening on http://localhost:${env.PORT}`));
