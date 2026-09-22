import { describe, expect, it } from 'vitest';
import { MAX_ACTION_CONTENT_LENGTH, MAX_PROPOSED_ACTIONS, createNodeAction, hasExplicitVisualCreationRequest, providerVisualResponse, validateProviderVisualResponse, visualProposalPayload } from '../server/src/visualProposal.js';
import { MockAiProvider } from '../server/src/aiProvider.js';

const action = { type: 'CREATE_NODE', clientActionId: 'action-1', nodeType: 'TASK', title: 'Produzir capa', content: 'Criar a capa oficial' } as const;

describe('visual action protocol', () => {
  it('requires an explicit visual creation request', async () => {
    expect(hasExplicitVisualCreationRequest('Crie três blocos no canvas')).toBe(true);
    expect(hasExplicitVisualCreationRequest('Organize isto no canvas')).toBe(true);
    expect(hasExplicitVisualCreationRequest('Como criar blocos no canvas?')).toBe(false);
    for (const message of ['ok', 'aprovado', 'ok, aprovado', 'confirmo', 'pode seguir', 'obrigado', 'cancele', 'rejeitado']) {
      expect(hasExplicitVisualCreationRequest(message)).toBe(false);
    }
    const mock = new MockAiProvider();
    expect((await mock.generate({ message: 'Crie três blocos no canvas', history: [], context: '' })).proposedActions).toHaveLength(3);
    expect((await mock.generate({ message: 'ok, aprovado', history: [], context: '' })).proposedActions).toBeUndefined();
  });
  it('accepts text without actions and valid one/multiple CREATE_NODE actions', () => {
    expect(validateProviderVisualResponse('Resposta normal', undefined).payload).toBeNull();
    expect(providerVisualResponse.parse({ assistantText: 'Preparei.', proposedActions: [action] }).proposedActions).toHaveLength(1);
    expect(providerVisualResponse.parse({ assistantText: 'Preparei.', proposedActions: [action, { ...action, clientActionId: 'action-2', nodeType: 'DECISION' }] }).proposedActions).toHaveLength(2);
  });
  it('uses closed enums, strict properties, trimming and explicit limits', () => {
    expect(() => createNodeAction.parse({ ...action, type: 'UPDATE_NODE' })).toThrow();
    expect(() => createNodeAction.parse({ ...action, nodeType: 'UNKNOWN' })).toThrow();
    expect(createNodeAction.parse({ ...action, title: '  Título  ', content: '  Conteúdo  ' })).toMatchObject({ title: 'Título', content: 'Conteúdo' });
    expect(() => createNodeAction.parse({ ...action, title: ' ' })).toThrow();
    expect(() => createNodeAction.parse({ ...action, content: 'x'.repeat(MAX_ACTION_CONTENT_LENGTH + 1) })).toThrow();
    expect(() => createNodeAction.parse({ ...action, projectId: 'forbidden' })).toThrow();
    expect(() => createNodeAction.parse({ ...action, createdBy: 'forbidden' })).toThrow();
    expect(() => createNodeAction.parse({ ...action, positionX: 1 })).toThrow();
  });
  it('rejects duplicate ids, dangerous markup, unknown root fields and too many actions atomically', () => {
    expect(() => providerVisualResponse.parse({ assistantText: 'x', proposedActions: [action, action] })).toThrow('DUPLICATE_CLIENT_ACTION_ID');
    expect(() => createNodeAction.parse({ ...action, content: '<script>alert(1)</script>' })).toThrow();
    expect(() => createNodeAction.parse({ ...action, content: 'javascript:alert(1)' })).toThrow();
    expect(() => providerVisualResponse.parse({ assistantText: 'x', proposedActions: [action], extra: true })).toThrow();
    const invalid = validateProviderVisualResponse('Texto seguro', Array.from({ length: MAX_PROPOSED_ACTIONS + 1 }, (_, index) => ({ ...action, clientActionId: `a-${index}` })));
    expect(invalid.payload).toBeNull();
    expect(invalid.assistantText).toBe('Texto seguro');
  });
  it('rejects malformed provider output without partially accepting a proposal', () => {
    expect(validateProviderVisualResponse('Texto seguro', '{not-json')).toMatchObject({ payload: null, assistantText: 'Texto seguro' });
    expect(() => visualProposalPayload.parse({ protocolVersion: '1.0', assistantText: 'x', proposedActions: [{ ...action, projectId: 'nope' }] })).toThrow();
  });
});
