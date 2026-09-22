export type ContextNode = { id: string; type: string; title: string; content: string };
export type ContextEdge = { sourceNodeId: string; targetNodeId: string; relationType: string; label?: string | null };
export type ContextMemory = { id: string; kind: 'FACT' | 'DECISION' | 'HYPOTHESIS' | 'GAP' | 'LEARNING'; title: string | null; content: string; confidence: number | null; sourceType: 'USER' | 'CONVERSATION' | 'CANVAS_NODE'; updatedAt: Date };

export const MAX_CONTEXT_NODES = 20;
export const MAX_CONTEXT_CHARS = 30000;
export const MEMORY_KIND_PRIORITY: Record<ContextMemory['kind'], number> = { DECISION: 0, FACT: 1, LEARNING: 2, HYPOTHESIS: 3, GAP: 4 };

export function selectProjectMemories(memories: ContextMemory[], maxItems: number, maxChars: number) {
  const ordered = [...memories].sort((a, b) => MEMORY_KIND_PRIORITY[a.kind] - MEMORY_KIND_PRIORITY[b.kind] || b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
  const selected: ContextMemory[] = [];
  let characters = 0;
  for (const memory of ordered) {
    const rendered = formatMemory(memory);
    const addedCharacters = (selected.length ? 2 : 0) + rendered.length;
    if (selected.length >= maxItems || characters + addedCharacters > maxChars) continue;
    selected.push(memory);
    characters += addedCharacters;
  }
  return { memories: selected, characters };
}

function formatMemory(memory: ContextMemory) {
  const marker = memory.kind === 'HYPOTHESIS' ? 'HYPOTHESIS — UNCONFIRMED' : memory.kind === 'GAP' ? 'GAP — MISSING INFORMATION' : memory.kind;
  return `[${marker}]\nTitle: ${memory.title || '(untitled)'}\nContent: ${memory.content}`;
}

export function buildProjectMemoryContext(memories: ContextMemory[], maxItems: number, maxChars: number) {
  const selection = selectProjectMemories(memories, maxItems, maxChars);
  const text = selection.memories.length ? `[PROJECT MEMORY]\n\n${selection.memories.map(formatMemory).join('\n\n')}\n\n[END PROJECT MEMORY]` : '';
  return { ...selection, text, characters: text.length };
}

export function buildConversationContext(nodes: ContextNode[], edges: ContextEdge[] = []) {
  const nodeIds = new Set(nodes.map(node => node.id));
  const internalEdges = edges.filter(edge => nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const sections = nodes.map(node => `[${node.type.toUpperCase()}]\nTitle: ${node.title}\nContent:\n${node.content || '(empty)'}`);
  const relations = internalEdges.map(edge => {
    const source = byId.get(edge.sourceNodeId)?.title ?? edge.sourceNodeId;
    const target = byId.get(edge.targetNodeId)?.title ?? edge.targetNodeId;
    return `${source} --${(edge.label || edge.relationType).toUpperCase()}--> ${target}`;
  });
  const result = `[SELECTED CANVAS CONTEXT]\n\n${sections.join('\n\n')}${relations.length ? `\n\nRELATIONSHIPS\n${relations.join('\n')}` : ''}\n\n[END SELECTED CANVAS CONTEXT]`;
  return { text: result, edges: internalEdges, characters: result.length };
}

export function assertContextLimits(nodeIds: string[], nodes: ContextNode[], contextText: string) {
  if (nodeIds.length > MAX_CONTEXT_NODES) throw new Error('CONTEXT_NODE_LIMIT');
  if (contextText.length > MAX_CONTEXT_CHARS) throw new Error('CONTEXT_TOO_LARGE');
  if (nodes.length !== new Set(nodeIds).size) throw new Error('INVALID_CONTEXT_NODES');
}
