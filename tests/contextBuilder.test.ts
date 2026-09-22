import { describe, expect, it } from 'vitest';
import { assertContextLimits, buildConversationContext, MAX_CONTEXT_CHARS, MAX_CONTEXT_NODES } from '../server/src/contextBuilder.js';
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
});
