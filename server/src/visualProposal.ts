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

export function validateProviderVisualResponse(content: string, proposedActions: unknown): { payload: VisualProposalPayload | null; assistantText: string } {
  const assistantText = content.trim().slice(0, MAX_ASSISTANT_TEXT_LENGTH);
  const parsed = providerVisualResponse.safeParse({ assistantText, proposedActions: proposedActions ?? [] });
  if (!parsed.success) return { payload: null, assistantText };
  if (parsed.data.proposedActions.length === 0) return { payload: null, assistantText: parsed.data.assistantText };
  return { payload: { protocolVersion: VISUAL_PROTOCOL_VERSION, ...parsed.data }, assistantText: parsed.data.assistantText };
}

export function parseStoredVisualProposal(payload: unknown): VisualProposalPayload {
  return visualProposalPayload.parse(payload);
}
