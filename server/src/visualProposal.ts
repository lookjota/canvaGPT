import { z } from 'zod';

export const VISUAL_PROTOCOL_VERSION = '1.0';
export const MAX_PROPOSED_ACTIONS = 20;
export const MAX_ACTION_ID_LENGTH = 100;
export const MAX_ACTION_TITLE_LENGTH = 200;
export const MAX_ACTION_CONTENT_LENGTH = 5_000;
export const MAX_ASSISTANT_TEXT_LENGTH = 8_000;

export const proposedNodeType = z.enum(['NOTE', 'TASK', 'DECISION', 'DOCUMENT', 'PROMPT', 'FILE']);
export const createNodeAction = z.object({
  type: z.literal('CREATE_NODE'),
  clientActionId: z.string().trim().min(1).max(MAX_ACTION_ID_LENGTH).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/),
  nodeType: proposedNodeType,
  title: z.string().trim().min(1).max(MAX_ACTION_TITLE_LENGTH).refine(value => !/<[^>]*>|javascript\s*:/i.test(value), 'EXECUTABLE_MARKUP_NOT_ALLOWED'),
  content: z.string().trim().max(MAX_ACTION_CONTENT_LENGTH).refine(value => !/<[^>]*>|javascript\s*:/i.test(value), 'EXECUTABLE_MARKUP_NOT_ALLOWED'),
}).strict();

export const visualProposalPayload = z.object({
  protocolVersion: z.literal(VISUAL_PROTOCOL_VERSION),
  assistantText: z.string().trim().min(1).max(MAX_ASSISTANT_TEXT_LENGTH),
  proposedActions: z.array(createNodeAction).max(MAX_PROPOSED_ACTIONS),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, action] of value.proposedActions.entries()) {
    if (ids.has(action.clientActionId)) context.addIssue({ code: 'custom', path: ['proposedActions', index, 'clientActionId'], message: 'DUPLICATE_CLIENT_ACTION_ID' });
    ids.add(action.clientActionId);
  }
});

export const providerVisualResponse = z.object({
  assistantText: z.string().trim().min(1).max(MAX_ASSISTANT_TEXT_LENGTH),
  proposedActions: z.array(createNodeAction).max(MAX_PROPOSED_ACTIONS).default([]),
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  for (const [index, action] of value.proposedActions.entries()) {
    if (ids.has(action.clientActionId)) context.addIssue({ code: 'custom', path: ['proposedActions', index, 'clientActionId'], message: 'DUPLICATE_CLIENT_ACTION_ID' });
    ids.add(action.clientActionId);
  }
});

export type VisualProposalPayload = z.infer<typeof visualProposalPayload>;
export type ProposedAction = z.infer<typeof createNodeAction>;

const visualCreationVerbs = /\b(?:crie|criar|cria|adicione|adicionar|monte|montar|gere|gerar|produza|produzir|organize|organizar|estruture|estruturar|decomponha|decompor|distribua|distribuir|proponha|propor)\b/i;
const visualTargets = /\b(?:canvas|blocos?|nodes?|elementos?|cart(?:õ|o)es?|tarefas?|decis(?:ão|oes)|plano\s+visual|proposta\s+visual|estrutura\s+visual)\b/i;

const confirmationPatterns = [
  /^(?:ok|okay|certo|confirmo|aprovado|aprovada|rejeitado|rejeitada|cancele|cancelado|cancelada|obrigado|obrigada)(?:[\s,!.:-]*(?:ok|okay|confirmo|aprovado|aprovada|pode seguir|rejeitado|rejeitada|cancele|cancelado|cancelada))?[\s.!?]*$/i,
  /^pode seguir[\s.!?]*$/i,
];

export function hasExplicitVisualCreationRequest(message: string): boolean {
  const normalized = message.trim();
  if (!normalized || confirmationPatterns.some(pattern => pattern.test(normalized)) || /^(?:como|o que|qual|quais|por que|quando|onde|posso)\b/i.test(normalized)) return false;
  // Intent is deliberately derived from this message only. Requiring both an
  // action verb and a visual target prevents an old proposal in the history
  // from turning a follow-up such as "?" into a new proposal.
  return visualCreationVerbs.test(normalized) && visualTargets.test(normalized);
}

export function isConfirmationOrProposalFollowUp(message: string): boolean {
  return confirmationPatterns.some(pattern => pattern.test(message.trim()));
}

export function validateProviderVisualResponse(content: string, proposedActions: unknown): { payload: VisualProposalPayload | null; assistantText: string } {
  const assistantText = content.trim().slice(0, MAX_ASSISTANT_TEXT_LENGTH);
  const parsed = providerVisualResponse.safeParse({ assistantText, proposedActions: proposedActions ?? [] });
  if (!parsed.success) return { payload: null, assistantText: proposalFailureText(assistantText) };
  if (parsed.data.proposedActions.length === 0) return { payload: null, assistantText: proposalFailureText(parsed.data.assistantText) };
  return { payload: { protocolVersion: VISUAL_PROTOCOL_VERSION, ...parsed.data }, assistantText: parsed.data.assistantText };
}

function proposalFailureText(assistantText: string): string {
  if (!/(?:proposta|card|bloco).*(?:criad|preparad|abaixo|aguardando)|(?:criad|preparad|abaixo|aguardando).*(?:proposta|card|bloco)/i.test(assistantText)) return assistantText;
  return 'Entendi o pedido, mas não foi possível gerar uma proposta visual válida.';
}

export function parseStoredVisualProposal(payload: unknown): VisualProposalPayload {
  return visualProposalPayload.parse(payload);
}
