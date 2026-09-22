import { describe, expect, it, vi } from 'vitest';
import { SerializedSaveQueue } from '../web/src/persistence';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('serialized persistence queue', () => {
  it('coalesces rapid changes and persists the latest snapshot', async () => {
    const saved: Record<string, unknown>[] = [];
    const queue = new SerializedSaveQueue(async (_id, snapshot) => { saved.push(snapshot); }, 5);
    queue.schedule('node-1', { title: 'one', positionX: 1 });
    queue.schedule('node-1', { title: 'two', positionX: 2 });
    queue.schedule('node-1', { title: 'three', positionX: 3 });
    await wait(20);
    expect(saved).toEqual([{ title: 'three', positionX: 3 }]);
  });

  it('serializes an immediate update behind an in-flight request', async () => {
    const saved: Record<string, unknown>[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>(resolve => { releaseFirst = resolve; });
    const save = vi.fn(async (_id: string, snapshot: Record<string, unknown>) => {
      saved.push(snapshot);
      if (saved.length === 1) await first;
    });
    const queue = new SerializedSaveQueue(save, 5);
    queue.schedule('node-1', { title: 'first' }, true);
    await wait(1);
    queue.schedule('node-1', { title: 'latest' }, true);
    releaseFirst();
    await queue.flush('node-1');
    expect(saved).toEqual([{ title: 'first' }, { title: 'latest' }]);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('flushes a pending debounce before navigation/reload cleanup', async () => {
    const save = vi.fn(async () => undefined);
    const queue = new SerializedSaveQueue(save, 10_000);
    queue.schedule('node-1', { content: 'last edit' });
    await queue.flush();
    expect(save).toHaveBeenCalledWith('node-1', { content: 'last edit' });
    expect(queue.hasPending()).toBe(false);
  });
});
