import { z } from 'zod';

export const projectMemoryKind = z.enum(['FACT', 'DECISION', 'HYPOTHESIS', 'GAP', 'LEARNING']);
export const projectMemorySourceType = z.enum(['USER', 'CONVERSATION', 'CANVAS_NODE']);
export const projectMemoryContent = z.string().trim().min(1).max(100000);
export const projectMemoryCreateInput = z.object({
  kind: projectMemoryKind,
  title: z.string().trim().max(200).nullable().optional(),
  content: projectMemoryContent,
  confidence: z.number().finite().min(0).max(1).nullable().optional(),
  sourceType: projectMemorySourceType,
  sourceRef: z.string().trim().max(500).nullable().optional(),
});
export const projectMemoryUpdateInput = projectMemoryCreateInput.partial();
