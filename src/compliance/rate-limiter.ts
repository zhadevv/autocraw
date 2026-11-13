import { sleep } from '../utils/sleep';

export class HostRateLimiter {
  private readonly nextSlot = new Map<string, number>();
  private readonly delays = new Map<string, number>();

  constructor(private readonly defaultDelayMs: number) {}

  setDelay(host: string, delayMs: number): void {
    const current = this.delays.get(host) ?? this.defaultDelayMs;
    this.delays.set(host, Math.max(current, delayMs));
  }

  async wait(host: string, signal?: AbortSignal): Promise<void> {
    const delay = this.delays.get(host) ?? this.defaultDelayMs;
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + delay);
    const waitMs = slot - now;
    if (waitMs > 0) await sleep(waitMs, signal);
  }

  penalize(host: string, extraMs: number): void {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + extraMs);
  }
}
