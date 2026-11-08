export interface FeedRefreshRequest {
  revision: number;
  force: boolean;
}

export class FeedRefreshGate {
  private revision = 0;
  private running = false;
  private queued = false;
  private forceQueued = false;

  request(force = false): FeedRefreshRequest | null {
    this.revision += 1;
    if (this.running) {
      this.queued = true;
      this.forceQueued ||= force;
      return null;
    }
    this.running = true;
    return { revision: this.revision, force };
  }

  isCurrent(request: FeedRefreshRequest): boolean {
    return request.revision === this.revision;
  }

  isRunning(): boolean {
    return this.running;
  }

  finish(): FeedRefreshRequest | null {
    this.running = false;
    if (!this.queued) return null;
    const force = this.forceQueued;
    this.queued = false;
    this.forceQueued = false;
    return this.request(force);
  }

  invalidate(): void {
    this.revision += 1;
    this.queued = false;
    this.forceQueued = false;
  }
}
