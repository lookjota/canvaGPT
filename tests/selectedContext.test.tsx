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

  it('renders a proposal from the send response immediately and after reload', async () => {
    const proposal = { id: 'proposal', projectId: 'project', conversationId: 'conversation', assistantMessageId: 'assistant', status: 'PROPOSED' as const, protocolVersion: '1.0', createdAt: '', payload: { protocolVersion: '1.0', assistantText: 'Preparei uma proposta visual aguardando revisão.', proposedActions: [{ type: 'CREATE_NODE' as const, clientActionId: 'decision', nodeType: 'DECISION' as const, title: 'Estratégia de lançamento', content: 'Decidir a estratégia.' }, { type: 'CREATE_NODE' as const, clientActionId: 'task-1', nodeType: 'TASK' as const, title: 'Produzir a página de vendas', content: 'Produzir a página.' }, { type: 'CREATE_NODE' as const, clientActionId: 'task-2', nodeType: 'TASK' as const, title: 'Configurar os anúncios', content: 'Configurar anúncios.' }] } };
    vi.spyOn(api, 'conversations').mockResolvedValue({ conversations: [] });
    vi.spyOn(api, 'createConversation').mockResolvedValue({ conversation: { id: 'conversation' } as never });
    vi.spyOn(api, 'sendMessage').mockResolvedValue({ userMessage: { id: 'user', role: 'user', content: 'Crie um plano visual', contextNodeIds: [], createdAt: '' }, assistantMessage: { id: 'assistant', role: 'assistant', content: proposal.payload.assistantText, contextNodeIds: [], createdAt: '', visualProposal: proposal } });
    render(<AiPanel projectId="project" nodes={nodes} selectedIds={new Set()} contextIds={[]} onContextChange={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('Digite uma mensagem…'), { target: { value: 'Crie um plano visual' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await vi.waitFor(() => expect(screen.getByText('Proposta visual')).toBeTruthy());
    expect(screen.getByText('DECISION — Estratégia de lançamento')).toBeTruthy();
    expect(screen.getByText('Status: aguardando revisão')).toBeTruthy();
    expect(screen.getByText('Esta proposta ainda não altera o canvas.')).toBeTruthy();

    vi.spyOn(api, 'conversations').mockResolvedValue({ conversations: [{ id: 'conversation', projectId: 'project', userId: 'user', createdAt: '', updatedAt: '' }] });
    vi.spyOn(api, 'conversation').mockResolvedValue({ conversation: { id: 'conversation', messages: [{ id: 'assistant', role: 'assistant', content: proposal.payload.assistantText, contextNodeIds: [], createdAt: '', visualProposal: proposal }] } as never });
    const reloaded = render(<AiPanel projectId="project" nodes={nodes} selectedIds={new Set()} contextIds={[]} onContextChange={vi.fn()} />);
    await vi.waitFor(() => expect(reloaded.getByText(/Configurar os anúncios/)).toBeTruthy());
  });
});
