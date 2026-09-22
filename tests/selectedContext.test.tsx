// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiPanel } from '../web/src/AiPanel';
import { api, type Node } from '../web/src/api';
import { toggleSelection } from '../web/src/selection';

const nodes: Node[] = [
  { id: 'a', type: 'note', title: 'Produto', content: 'Plano principal', positionX: 0, positionY: 0, width: 240, height: 160, status: null, tags: [] },
  { id: 'b', type: 'task', title: 'Preço', content: 'R$ 100', positionX: 300, positionY: 0, width: 240, height: 160, status: null, tags: [] },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('selected context', () => {
  it('keeps visual selection separate and toggles multi-selection once', () => {
    const selected = toggleSelection(new Set<string>(), 'a', false);
    expect([...selected]).toEqual(['a']);
    expect([...toggleSelection(selected, 'b', true)]).toEqual(['a', 'b']);
    expect([...toggleSelection(new Set(['a', 'b']), 'b', true)]).toEqual(['a']);
  });

  it('adds, preserves, removes and clears pinned context', async () => {
    vi.spyOn(api, 'conversations').mockResolvedValue({ conversations: [] });
    const onContextChange = vi.fn();
    const view = render(<AiPanel projectId="project" nodes={nodes} selectedIds={new Set(['a', 'b'])} contextIds={[]} onContextChange={onContextChange} />);
    expect(screen.getByText('0 elementos no contexto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Usar como contexto (2)' }));
    expect(onContextChange).toHaveBeenLastCalledWith(['a', 'b']);

    view.rerender(<AiPanel projectId="project" nodes={nodes} selectedIds={new Set()} contextIds={['a', 'b']} onContextChange={onContextChange} />);
    expect(screen.getByText('2 elementos no contexto')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remover Produto' }));
    expect(onContextChange).toHaveBeenLastCalledWith(['b']);
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));
    expect(onContextChange).toHaveBeenLastCalledWith([]);
  });

  it('sends exactly the pinned node IDs, not node content', async () => {
    vi.spyOn(api, 'conversations').mockResolvedValue({ conversations: [] });
    vi.spyOn(api, 'createConversation').mockResolvedValue({ conversation: { id: 'conversation' } as never });
    const sendMessage = vi.spyOn(api, 'sendMessage').mockResolvedValue({ userMessage: { id: 'u', role: 'user', content: 'Pergunta', contextNodeIds: ['a', 'b'], createdAt: '' }, assistantMessage: { id: 's', role: 'assistant', content: 'Resposta', contextNodeIds: [], createdAt: '' } });
    render(<AiPanel projectId="project" nodes={nodes} selectedIds={new Set()} contextIds={['a', 'b']} onContextChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Digite uma mensagem…'), { target: { value: 'Qual é o produto?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith('project', 'conversation', { content: 'Qual é o produto?', contextNodeIds: ['a', 'b'] }));
  });
});
