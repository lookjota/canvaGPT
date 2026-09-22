import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, type Node, type NodeType, type Project } from './api';
import { clampZoom, constrainNodeSize, dragDelta, fitView, normalizeViewport, screenToWorld, zoomAroundPoint, type Point, type Viewport } from './canvasGeometry';
import { SerializedSaveQueue } from './persistence';
import './styles.css';

const labels: Record<NodeType, string> = { note: 'Nota', task: 'Tarefa', decision: 'Decisão', document: 'Documento', prompt: 'Prompt', file: 'Arquivo', ai_response: 'Resposta IA', frame: 'Frame' };
const enabledTypes: NodeType[] = ['note', 'task', 'decision'];

function AuthPage({ register = false }: { register?: boolean }) { const nav = useNavigate(); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); try { await (register ? api.register({ name, email, password }) : api.login({ email, password })); nav('/app'); } catch (error) { setError(error instanceof Error ? error.message : 'Falha ao autenticar'); } }; return <main className="auth"><div className="auth-card"><div className="brand">◈ ORION</div><h1>{register ? 'Crie seu workspace' : 'Volte ao seu espaço'}</h1><p className="muted">Memória visual para projetos que precisam avançar.</p><form onSubmit={submit}>{register && <input aria-label="Nome" placeholder="Seu nome" value={name} onChange={event => setName(event.target.value)} required />}<input aria-label="Email" type="email" placeholder="Email" value={email} onChange={event => setEmail(event.target.value)} required /><input aria-label="Senha" type="password" placeholder="Senha (mínimo 8 caracteres)" value={password} onChange={event => setPassword(event.target.value)} minLength={8} required />{error && <div className="error">{error}</div>}<button className="primary">{register ? 'Criar conta' : 'Entrar'}</button></form><p className="switch">{register ? 'Já tem conta? ' : 'Ainda não tem conta? '}<Link to={register ? '/login' : '/register'}>{register ? 'Entrar' : 'Criar conta'}</Link></p></div></main>; }

function Protected({ children }: { children: React.ReactNode }) { const [state, setState] = useState<'loading' | 'ok' | 'no'>('loading'); useEffect(() => { api.me().then(() => setState('ok')).catch(() => setState('no')); }, []); if (state === 'loading') return <div className="loading">Carregando Orion…</div>; return state === 'ok' ? <>{children}</> : <Navigate to="/login" replace />; }

function Dashboard() { const [projects, setProjects] = useState<Project[]>([]); const [name, setName] = useState(''); const [creating, setCreating] = useState(false); const [query, setQuery] = useState(''); const nav = useNavigate(); useEffect(() => { api.projects().then(result => setProjects(result.projects)); }, []); const create = async () => { if (!name.trim()) return; const { project } = await api.createProject({ name }); setName(''); setCreating(false); nav(`/app/projects/${project.id}`); }; return <div className="app-shell"><header className="topbar"><Link to="/app" className="brand">◈ ORION</Link><div className="top-actions"><span className="muted">Workspace pessoal</span><button onClick={() => api.logout().then(() => nav('/login'))}>Sair</button></div></header><main className="dashboard"><div className="dashboard-head"><div><p className="eyebrow">SEU ESPAÇO</p><h1>Projetos que ganham forma.</h1><p className="muted">Organize decisões, contexto e próximos passos em um só lugar.</p></div><button className="primary" onClick={() => setCreating(true)}>＋ Novo projeto</button></div>{creating && <div className="create-row"><input autoFocus placeholder="Nome do projeto" value={name} onChange={event => setName(event.target.value)} onKeyDown={event => event.key === 'Enter' && create()} /><button className="primary" onClick={create}>Criar</button><button onClick={() => setCreating(false)}>Cancelar</button></div>}<input className="search" placeholder="Buscar projetos…" value={query} onChange={event => setQuery(event.target.value)} /><div className="section-title"><span>Ativos</span><span className="count">{projects.filter(project => !project.isArchived).length}</span></div><div className="project-grid">{projects.filter(project => !project.isArchived && project.name.toLowerCase().includes(query.toLowerCase())).map(project => <button className="project-card" key={project.id} onClick={() => nav(`/app/projects/${project.id}`)}><span className="project-icon" style={{ background: project.color }}>{project.icon}</span><strong>{project.name}</strong><span className="muted">Atualizado {new Date(project.updatedAt).toLocaleDateString('pt-BR')}</span></button>)}{!projects.length && <div className="empty">Seu primeiro projeto começa aqui.</div>}</div></main></div>; }

type SaveStatus = 'Salvo' | 'Salvando…' | 'Erro';
type ProjectWithNodes = Project & { nodes: Node[]; edges: { id: string }[] };

function Workspace() {
  const { projectId } = useParams();
  const [project, setProject] = useState<ProjectWithNodes | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<'select' | 'pan'>('select');
  const [status, setStatus] = useState<SaveStatus>('Salvo');
  const canvas = useRef<HTMLDivElement>(null);
  const nodeSnapshots = useRef(new Map<string, Node>());
  const cancelledCreates = useRef(new Set<string>());
  const createPromises = useRef(new Map<string, Promise<Node>>());
  const nodeQueue = useRef<SerializedSaveQueue | null>(null);
  const viewQueue = useRef<SerializedSaveQueue | null>(null);
  const pan = useRef<{ start: Point; view: Viewport } | null>(null);
  const refreshStatus = useCallback(() => {
    if (nodeQueue.current?.hasPending() || viewQueue.current?.hasPending()) setStatus('Salvando…');
    else setStatus('Salvo');
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    nodeQueue.current = new SerializedSaveQueue((id, snapshot) => {
      if (id.startsWith('temp-')) {
        const creation = createPromises.current.get(id);
        if (!creation) return Promise.resolve();
        return creation.then(node => cancelledCreates.current.has(id) ? undefined : api.updateNode(projectId, node.id, snapshot).then(() => undefined));
      }
      return api.updateNode(projectId, id, snapshot).then(() => undefined);
    }, 600, () => setStatus('Erro'), refreshStatus);
    viewQueue.current = new SerializedSaveQueue((_id, snapshot) => api.saveView(projectId, snapshot).then(() => undefined), 600, () => setStatus('Erro'), refreshStatus);
    api.project(projectId).then(result => {
      if (!active) return;
      setProject(result.project);
      nodeSnapshots.current = new Map(result.project.nodes.map(node => [node.id, node]));
      setNodes(result.project.nodes);
      if (result.viewState) setView(normalizeViewport({ x: result.viewState.viewportX, y: result.viewState.viewportY, zoom: result.viewState.zoom }));
      refreshStatus();
    }).catch(() => active && setStatus('Erro'));
    const flush = () => { void nodeQueue.current?.flush(); void viewQueue.current?.flush(); };
    window.addEventListener('pagehide', flush);
    return () => { active = false; window.removeEventListener('pagehide', flush); flush(); };
  }, [projectId, refreshStatus]);
  const persistView = useCallback((next: Viewport, immediate = false) => {
    if (!projectId || !viewQueue.current) return;
    setStatus('Salvando…');
    viewQueue.current.schedule(projectId, { viewportX: next.x, viewportY: next.y, zoom: next.zoom }, immediate);
  }, [projectId]);
  const changeView = (next: Viewport, immediate = false) => { const normalized = normalizeViewport(next); setView(normalized); persistView(normalized, immediate); };
  const persistNode = useCallback((id: string, snapshot: Node, immediate = false) => {
    if (!projectId || !nodeQueue.current) return;
    setStatus('Salvando…');
    nodeQueue.current.schedule(id, { type: snapshot.type, title: snapshot.title, content: snapshot.content, positionX: snapshot.positionX, positionY: snapshot.positionY, width: snapshot.width, height: snapshot.height, status: snapshot.status, tags: snapshot.tags }, immediate);
  }, [projectId]);
  const updateNode = (id: string, patch: Partial<Node>, immediate = false) => {
    const current = nodeSnapshots.current.get(id);
    if (!current) return;
    const next = { ...current, ...patch };
    nodeSnapshots.current.set(id, next);
    setNodes(nodesNow => nodesNow.map(node => node.id === id ? next : node));
    persistNode(id, next, immediate);
  };
  const addNode = async (type: NodeType) => {
    if (!projectId || !canvas.current) return;
    const rect = canvas.current.getBoundingClientRect();
    const center = screenToWorld({ x: rect.width / 2, y: rect.height / 2 }, view);
    const offset = nodeSnapshots.current.size * 28;
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic: Node = { id: tempId, type, title: labels[type], content: '', positionX: center.x - 120 + offset, positionY: center.y - 80 + offset, width: 240, height: 160, status: null, tags: [] };
    nodeSnapshots.current.set(tempId, optimistic);
    setNodes(current => [...current, optimistic]);
    setSelected(tempId);
    setStatus('Salvando…');
    try {
      const creation = api.createNode(projectId, { type: optimistic.type, title: optimistic.title, content: optimistic.content, positionX: optimistic.positionX, positionY: optimistic.positionY, width: optimistic.width, height: optimistic.height }).then(result => result.node);
      createPromises.current.set(tempId, creation);
      const node = await creation;
      if (cancelledCreates.current.delete(tempId)) {
        await api.deleteNode(projectId, node.id);
        nodeSnapshots.current.delete(tempId);
        createPromises.current.delete(tempId);
        return;
      }
      const latest = nodeSnapshots.current.get(tempId) ?? optimistic;
      nodeSnapshots.current.delete(tempId);
      nodeSnapshots.current.set(node.id, { ...node, ...latest, id: node.id });
      setNodes(current => current.map(item => item.id === tempId ? { ...node, ...latest, id: node.id } : item));
      if (selected === tempId) setSelected(node.id);
      nodeQueue.current?.rekey(tempId, node.id);
      persistNode(node.id, { ...node, ...latest, id: node.id }, true);
      createPromises.current.delete(tempId);
    } catch { createPromises.current.delete(tempId); nodeSnapshots.current.delete(tempId); setNodes(current => current.filter(item => item.id !== tempId)); setStatus('Erro'); }
  };
  const removeNode = async (id: string) => {
    if (!projectId) return;
    if (id.startsWith('temp-')) { cancelledCreates.current.add(id); nodeQueue.current?.cancel(id); nodeSnapshots.current.delete(id); setNodes(current => current.filter(node => node.id !== id)); return; }
    try { await nodeQueue.current?.flush(id); await api.deleteNode(projectId, id); nodeSnapshots.current.delete(id); setNodes(current => current.filter(node => node.id !== id)); if (selected === id) setSelected(null); refreshStatus(); } catch { setStatus('Erro'); }
  };
  const zoomAt = (screenPoint: Point, factor: number) => changeView(zoomAroundPoint(view, screenPoint, clampZoom(view.zoom * factor)), false);
  const fit = () => { const rect = canvas.current?.getBoundingClientRect(); if (!rect) return; changeView(fitView(nodes, { width: rect.width, height: rect.height }), true); };
  const onCanvasPointerDown = (event: React.PointerEvent<HTMLDivElement>) => { if (event.target !== event.currentTarget) return; setSelected(null); if (tool === 'pan' || event.button === 1) { pan.current = { start: { x: event.clientX, y: event.clientY }, view }; event.currentTarget.setPointerCapture(event.pointerId); } };
  const onCanvasPointerMove = (event: React.PointerEvent<HTMLDivElement>) => { if (!pan.current) return; const delta = { x: event.clientX - pan.current.start.x, y: event.clientY - pan.current.start.y }; const next = { ...pan.current.view, x: pan.current.view.x + delta.x, y: pan.current.view.y + delta.y }; pan.current.view = next; setView(next); };
  const onCanvasPointerUp = () => { if (!pan.current) return; const next = pan.current.view; pan.current = null; persistView(next, true); };
  if (!project) return <div className="loading">Abrindo workspace…</div>;
  return <div className="workspace"><header className="workspace-top"><Link to="/app" className="back">←</Link><span className="project-dot" style={{ background: project.color }} /><input className="project-name" value={project.name} onChange={event => setProject({ ...project, name: event.target.value })} onBlur={() => api.updateProject(project.id, { name: project.name })} /><span className={status === 'Erro' ? 'save-error' : 'save-status'}>{status}</span><div className="top-actions"><span>{Math.round(view.zoom * 100)}%</span><button aria-label="Diminuir zoom" onClick={() => zoomAt({ x: (canvas.current?.clientWidth ?? 0) / 2, y: (canvas.current?.clientHeight ?? 0) / 2 }, 0.8)}>−</button><button aria-label="Aumentar zoom" onClick={() => zoomAt({ x: (canvas.current?.clientWidth ?? 0) / 2, y: (canvas.current?.clientHeight ?? 0) / 2 }, 1.25)}>＋</button><button onClick={fit}>Ajustar à tela</button></div></header><div className="workspace-body"><aside className="toolbar"><button className={tool === 'select' ? 'active' : ''} onClick={() => setTool('select')}>↖<small>Selecionar</small></button><button className={tool === 'pan' ? 'active' : ''} onClick={() => setTool('pan')}>✋<small>Mover tela</small></button><hr />{enabledTypes.map(type => <button key={type} onClick={() => addNode(type)}><span className="tool-symbol">{type === 'note' ? '▤' : type === 'task' ? '☑' : '◇'}</span><small>{labels[type]}</small></button>)}</aside><div className={`canvas ${tool === 'pan' ? 'pan-mode' : ''}`} ref={canvas} onWheel={event => { event.preventDefault(); zoomAt({ x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY }, event.deltaY < 0 ? 1.1 : 0.9); }} onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove} onPointerUp={onCanvasPointerUp}>{nodes.map(node => <NodeCard key={node.id} node={node} zoom={view.zoom} offset={view} selected={selected === node.id} tool={tool} onSelect={() => setSelected(node.id)} onUpdate={(patch, immediate) => updateNode(node.id, patch, immediate)} onDelete={() => removeNode(node.id)} />)}</div><aside className="assistant"><div className="eyebrow">ASSISTENTE</div><h2>Contexto do projeto</h2><p className="muted">O chat com IA será conectado numa próxima fase. Por enquanto, o canvas está pronto para organizar contexto.</p>{selected && <div className="context-list"><div>◈ {nodes.find(node => node.id === selected)?.title}</div></div>}</aside></div></div>;
}

function NodeCard({ node, zoom, offset, selected, tool, onSelect, onUpdate, onDelete }: { node: Node; zoom: number; offset: Viewport; selected: boolean; tool: string; onSelect: () => void; onUpdate: (patch: Partial<Node>, immediate?: boolean) => void; onDelete: () => void }) {
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; positionX: number; positionY: number } | null>(null);
  const move = (event: React.PointerEvent<HTMLElement>) => { if (!drag.current) return; const delta = dragDelta({ x: event.clientX - drag.current.x, y: event.clientY - drag.current.y }, zoom); drag.current.positionX = drag.current.ox + delta.x; drag.current.positionY = drag.current.oy + delta.y; onUpdate({ positionX: drag.current.positionX, positionY: drag.current.positionY }); };
  const stopInteraction = () => { if (drag.current) { onUpdate({ positionX: drag.current.positionX, positionY: drag.current.positionY }, true); drag.current = null; } };
  return <article className={`node node-${node.type} ${selected ? 'selected' : ''}`} style={{ left: node.positionX * zoom + offset.x, top: node.positionY * zoom + offset.y, width: node.width * zoom, height: node.height * zoom }} onPointerMove={move} onPointerUp={stopInteraction} onClick={event => { event.stopPropagation(); onSelect(); }}><div className="node-head" onPointerDown={event => { if (tool === 'pan') return; event.stopPropagation(); drag.current = { x: event.clientX, y: event.clientY, ox: node.positionX, oy: node.positionY, positionX: node.positionX, positionY: node.positionY }; event.currentTarget.setPointerCapture(event.pointerId); }}><span className="node-kind">{labels[node.type]}</span><button aria-label={`Excluir ${labels[node.type]}`} onPointerDown={event => event.stopPropagation()} onClick={onDelete}>×</button></div><input value={node.title} onChange={event => onUpdate({ title: event.target.value })} onBlur={event => onUpdate({ title: event.currentTarget.value }, true)} onPointerDown={event => event.stopPropagation()} /><textarea value={node.content} onChange={event => onUpdate({ content: event.target.value })} onBlur={event => onUpdate({ content: event.currentTarget.value }, true)} placeholder="Escreva aqui…" onPointerDown={event => event.stopPropagation()} /><div className="resize" onPointerDown={event => { event.stopPropagation(); const start = { x: event.clientX, y: event.clientY, width: node.width, height: node.height }; let latest = constrainNodeSize(node.width, node.height); const onMove = (moveEvent: PointerEvent) => { latest = constrainNodeSize(start.width + (moveEvent.clientX - start.x) / zoom, start.height + (moveEvent.clientY - start.y) / zoom); onUpdate(latest); }; const onUp = () => { onUpdate(latest, true); window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); }} /></article>;
}

function App() { return <Routes><Route path="/login" element={<AuthPage />} /><Route path="/register" element={<AuthPage register />} /><Route path="/app" element={<Protected><Dashboard /></Protected>} /><Route path="/app/projects/:projectId" element={<Protected><Workspace /></Protected>} /><Route path="*" element={<Navigate to="/app" replace />} /></Routes>; }
createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>);
