/** One in-flight write, coalesced snapshots. A failed latest snapshot stays available for retry. */
export class SerializedWriter<T> {
  private desired?: { revision: number; value: T };
  private revision = 0;
  private running?: Promise<void>;
  private failedRevision?: number;
  constructor(
    private write: (value: T) => Promise<unknown>,
    private onError: (error: unknown) => void,
  ) {}
  enqueue(value: T): void {
    this.desired = { revision: ++this.revision, value: structuredClone(value) };
    this.retry();
  }
  retry(): void {
    if (this.running || !this.desired) return;
    this.running = this.drain().finally(() => {
      this.running = undefined;
      // A new snapshot can arrive after drain returns but before this microtask runs.
      if (this.desired && this.desired.revision !== this.failedRevision) this.retry();
    });
  }
  async flush(): Promise<void> {
    while (this.running) await this.running;
  }
  private async drain(): Promise<void> {
    while (this.desired) {
      const current = this.desired;
      try {
        await this.write(current.value);
      } catch (error) {
        // A superseded error must not discard a newer pending snapshot.
        if (this.desired.revision !== current.revision) continue;
        this.failedRevision = current.revision;
        this.onError(error);
        return;
      }
      this.failedRevision = undefined;
      if (this.desired.revision === current.revision) this.desired = undefined;
    }
  }
}
