import { describe, expect, it } from 'vitest';
import { projectMemoryCreateInput, projectMemoryKind, projectMemorySourceType } from '../server/src/projectMemory.js';

describe('canonical project memory validation', () => {
  it('accepts exactly the five canonical kinds and closed provenance types', () => {
    expect(projectMemoryKind.options).toEqual(['FACT', 'DECISION', 'HYPOTHESIS', 'GAP', 'LEARNING']);
    expect(projectMemorySourceType.options).toEqual(['USER', 'CONVERSATION', 'CANVAS_NODE']);
    for (const kind of projectMemoryKind.options) {
      expect(projectMemoryCreateInput.parse({ kind, content: 'A durable project memory', sourceType: 'USER' }).kind).toBe(kind);
    }
  });

  it('rejects empty content, invalid confidence and invalid enums', () => {
    expect(() => projectMemoryCreateInput.parse({ kind: 'FACT', content: '  ', sourceType: 'USER' })).toThrow();
    expect(() => projectMemoryCreateInput.parse({ kind: 'FACT', content: 'content', confidence: -0.01, sourceType: 'USER' })).toThrow();
    expect(() => projectMemoryCreateInput.parse({ kind: 'FACT', content: 'content', confidence: 1.01, sourceType: 'USER' })).toThrow();
    expect(() => projectMemoryCreateInput.parse({ kind: 'OTHER', content: 'content', sourceType: 'USER' })).toThrow();
    expect(() => projectMemoryCreateInput.parse({ kind: 'FACT', content: 'content', sourceType: 'OTHER' })).toThrow();
  });
});
