import { describe, expect, it } from 'vitest';
import { assertContextLimits, buildConversationContext, buildProjectMemoryContext, MAX_CONTEXT_CHARS, MAX_CONTEXT_NODES } from '../server/src/contextBuilder.js';
import { MockAiProvider } from '../server/src/aiProvider.js';

const nodes = [
  { id: 'a', type: 'note', title: 'Pesquisa', content: 'Mercado crescente.' },
  { id: 'b', type: 'decision', title: 'Posicionamento', content: 'Foco em PMEs.' },
  { id: 'c', type: 'task', title: 'Validar oferta', content: 'Entrevistar clientes.' },
];

describe('conversation context', () => {
  it('formats one node and different node types structurally', () => {
    const result = buildConversationContext([nodes[0], nodes[1]]);
    expect(result.text).toContain('[NOTE]\nTitle: Pesquisa');
    expect(result.text).toContain('[DECISION]\nTitle: Posicionamento');
  });
  it('includes only edges internal to the context', () => {
    const result = buildConversationContext(nodes.slice(0, 2), [
      { sourceNodeId: 'a', targetNodeId: 'b', relationType: 'supports' },
      { sourceNodeId: 'b', targetNodeId: 'c', relationType: 'generates' },
    ]);
    expect(result.text).toContain('Pesquisa --SUPPORTS--> Posicionamento');
    expect(result.text).not.toContain('GENERATES');
  });
  it('enforces deterministic node and context limits', () => {
    expect(() => assertContextLimits(Array.from({ length: MAX_CONTEXT_NODES + 1 }, (_, i) => String(i)), [], '')).toThrow('CONTEXT_NODE_LIMIT');
    expect(() => assertContextLimits([], [], 'x'.repeat(MAX_CONTEXT_CHARS + 1))).toThrow('CONTEXT_TOO_LARGE');
  });
  it('keeps snapshots independent from later node edits', () => {
    const snapshot = { titleSnapshot: nodes[0].title, contentSnapshot: nodes[0].content };
    nodes[0].title = 'Pesquisa editada'; nodes[0].content = 'Novo conteúdo';
    expect(snapshot).toEqual({ titleSnapshot: 'Pesquisa', contentSnapshot: 'Mercado crescente.' });
  });
  it('provides a deterministic mock without external API calls', async () => {
    const response = await new MockAiProvider().generate({ message: 'Oi', history: [], context: 'PROJECT CONTEXT' });
    expect(response.content).toContain('Mock Orion response: Oi');
  });
  it('selects canonical memories by priority, recency and whole-record budget', () => {
    const date = new Date('2026-09-22T10:00:00Z');
    const result = buildProjectMemoryContext([
      { id: 'gap', kind: 'GAP', title: 'Gap', content: 'G', confidence: null, sourceType: 'USER', updatedAt: date },
      { id: 'fact', kind: 'FACT', title: 'Fact', content: 'F', confidence: .8, sourceType: 'USER', updatedAt: date },
      { id: 'decision', kind: 'DECISION', title: 'Decision', content: 'D', confidence: 1, sourceType: 'CONVERSATION', updatedAt: date },
      { id: 'hypothesis', kind: 'HYPOTHESIS', title: 'Hypothesis', content: 'H', confidence: .2, sourceType: 'USER', updatedAt: date },
    ], 3, 10_000);
    expect(result.memories.map(memory => memory.kind)).toEqual(['DECISION', 'FACT', 'HYPOTHESIS']);
    expect(result.text).toContain('[HYPOTHESIS — UNCONFIRMED]');
    expect(result.text).not.toContain('[GAP');
    const bounded = buildProjectMemoryContext(result.memories, 20, 1);
    expect(bounded.memories).toHaveLength(0);
  });
  it('keeps memory and selected canvas sections distinct', () => {
    expect(buildProjectMemoryContext([], 20, 100).text).toBe('');
    expect(buildConversationContext([nodes[0]]).text).toContain('[SELECTED CANVAS CONTEXT]');
  });
});
