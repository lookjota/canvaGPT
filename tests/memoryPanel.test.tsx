// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryPanel } from '../web/src/MemoryPanel';
import { api, type ProjectMemory } from '../web/src/api';

const memory = (overrides: Partial<ProjectMemory> = {}): ProjectMemory => ({ id: 'm1', projectId: 'project-a', kind: 'FACT', title: 'Regra de negócio', content: 'O projeto precisa de revisão.', status: 'ACTIVE', confidence: .8, sourceType: 'USER', sourceRef: null, createdBy: 'user', confirmedAt: null, archivedAt: null, createdAt: '2026-09-22T10:00:00.000Z', updatedAt: '2026-09-22T10:00:00.000Z', ...overrides });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('canonical memory panel', () => {
  it('loads active memories, filters by kind, shows empty state and keeps project id from props', async () => {
    const load = vi.spyOn(api, 'memories').mockResolvedValue({ memories: [memory(), memory({ id: 'm2', kind: 'DECISION', title: 'Decisão', content: 'Escolher A' })] });
    render(<MemoryPanel projectId="project-a" />);
    await vi.waitFor(() => expect(screen.getByText('Regra de negócio')).toBeTruthy());
    expect(load).toHaveBeenCalledWith('project-a', false);
    fireEvent.change(screen.getByLabelText('Filtrar'), { target: { value: 'DECISION' } });
    expect(screen.queryByText('Regra de negócio')).toBeNull();
    expect(screen.getAllByText('Decisão').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Filtrar'), { target: { value: 'GAP' } });
    expect(screen.getByText('Nenhuma memória ativa encontrada.')).toBeTruthy();
  });

  it('creates valid trimmed memory and rejects empty content or invalid confidence', async () => {
    vi.spyOn(api, 'memories').mockResolvedValue({ memories: [] });
    const create = vi.spyOn(api, 'createMemory').mockResolvedValue({ memory: memory({ title: 'Nova', content: 'Conteúdo aparado' }) });
    render(<MemoryPanel projectId="project-a" />);
    await vi.waitFor(() => expect(screen.getByText('Nenhuma memória ativa encontrada.')).toBeTruthy());
    fireEvent.submit(screen.getByRole('button', { name: 'Criar memória' }).closest('form')!);
    expect(screen.getByText('O conteúdo é obrigatório.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Conteúdo'), { target: { value: '  Conteúdo aparado  ' } });
    fireEvent.change(screen.getByLabelText(/Confiança/), { target: { value: '2' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Criar memória' }).closest('form')!);
    expect(screen.getByText('A confiança deve estar entre 0 e 1.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Confiança/), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar memória' }));
    await vi.waitFor(() => expect(create).toHaveBeenCalledWith('project-a', expect.objectContaining({ content: 'Conteúdo aparado', confidence: .75, sourceType: 'USER' })));
  });

  it('edits, archives only after confirmation, cancels archive, restores and loads archived view', async () => {
    const active = memory(); const archived = memory({ status: 'ARCHIVED', archivedAt: '2026-09-22T11:00:00.000Z' });
    vi.spyOn(api, 'memories').mockImplementation(async (_projectId, isArchived) => ({ memories: isArchived ? [archived] : [active] }));
    const update = vi.spyOn(api, 'updateMemory').mockResolvedValue({ memory: memory({ title: 'Editada' }) });
    const archive = vi.spyOn(api, 'archiveMemory').mockResolvedValue({ memory: archived });
    const restore = vi.spyOn(api, 'restoreMemory').mockResolvedValue({ memory: active });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MemoryPanel projectId="project-a" />);
    await vi.waitFor(() => expect(screen.getByText('Regra de negócio')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Título (opcional)'), { target: { value: 'Editada' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await vi.waitFor(() => expect(update).toHaveBeenCalledWith('project-a', 'm1', expect.objectContaining({ title: 'Editada' })));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Arquivar' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    expect(archive).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    await vi.waitFor(() => expect(archive).toHaveBeenCalledWith('project-a', 'm1'));
    fireEvent.click(screen.getByRole('button', { name: 'Arquivadas' }));
    await vi.waitFor(() => expect(screen.getByText('Restaurar')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }));
    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith('project-a', 'm1'));
  });

  it('shows safe API errors without exposing content or stack traces', async () => {
    vi.spyOn(api, 'memories').mockRejectedValue(new Error('secret-content and stack trace'));
    render(<MemoryPanel projectId="project-a" />);
    await vi.waitFor(() => expect(screen.getByText('Não foi possível carregar as memórias.')).toBeTruthy());
    expect(screen.queryByText(/secret-content|stack trace/)).toBeNull();
  });
});
