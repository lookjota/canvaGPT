export type SaveScheduler = (id: string, snapshot: Record<string, unknown>) => Promise<void>;

type Entry = {
  snapshot: Record<string, unknown>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<void> | null;
  dirty: boolean;
};

/** Debounces changes but serializes writes for each resource. */
export class SerializedSaveQueue {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly save: SaveScheduler, private readonly delay = 600, private readonly onError?: (error: unknown) => void, private readonly onSuccess?: () => void) {}

  schedule(id: string, snapshot: Record<string, unknown>, immediate = false): void {
    const entry = this.entries.get(id) ?? { snapshot, timer: null, inFlight: null, dirty: false };
    entry.snapshot = snapshot;
    entry.dirty = true;
    this.entries.set(id, entry);
    if (entry.timer) clearTimeout(entry.timer);
    if (immediate) void this.write(id, entry).catch(error => this.onError?.(error));
    else entry.timer = setTimeout(() => void this.write(id, entry).catch(error => this.onError?.(error)), this.delay);
  }

  async flush(id?: string): Promise<void> {
    const entries = id ? [[id, this.entries.get(id)] as const] : [...this.entries.entries()];
    await Promise.all(entries.map(async ([entryId, entry]) => {
      if (!entry) return;
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = null;
      await this.write(entryId, entry);
    }));
  }

  rekey(from: string, to: string): void {
    const entry = this.entries.get(from);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.entries.delete(from);
    this.entries.set(to, entry);
  }

  cancel(id?: string): void {
    const ids = id ? [id] : [...this.entries.keys()];
    for (const entryId of ids) {
      const entry = this.entries.get(entryId);
      if (entry?.timer) clearTimeout(entry.timer);
      if (entry) entry.timer = null;
    }
  }

  hasPending(): boolean {
    return [...this.entries.values()].some(entry => entry.dirty || entry.inFlight !== null || entry.timer !== null);
  }

  private async write(id: string, entry: Entry): Promise<void> {
    if (entry.inFlight) {
      await entry.inFlight;
      if (entry.dirty) await this.write(id, entry);
      return;
    }
    if (!entry.dirty) return;
    entry.timer = null;
    entry.dirty = false;
    const snapshot = { ...entry.snapshot };
    const request = this.save(id, snapshot).catch(error => {
      entry.dirty = true;
      throw error;
    });
    entry.inFlight = request;
    try {
      await request;
    } finally {
      entry.inFlight = null;
    }
    this.onSuccess?.();
  }
}
