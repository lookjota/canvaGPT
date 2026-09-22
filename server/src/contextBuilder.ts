export type ContextNode = { id: string; type: string; title: string; content: string };
export type ContextEdge = { sourceNodeId: string; targetNodeId: string; relationType: string; label?: string | null };

export const MAX_CONTEXT_NODES = 20;
export const MAX_CONTEXT_CHARS = 30000;

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
  const result = `PROJECT CONTEXT\n\n${sections.join('\n\n')}${relations.length ? `\n\nRELATIONSHIPS\n${relations.join('\n')}` : ''}`;
  return { text: result, edges: internalEdges, characters: result.length };
}

export function assertContextLimits(nodeIds: string[], nodes: ContextNode[], contextText: string) {
  if (nodeIds.length > MAX_CONTEXT_NODES) throw new Error('CONTEXT_NODE_LIMIT');
  if (contextText.length > MAX_CONTEXT_CHARS) throw new Error('CONTEXT_TOO_LARGE');
  if (nodes.length !== new Set(nodeIds).size) throw new Error('INVALID_CONTEXT_NODES');
}
