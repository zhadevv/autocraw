export interface QueueItem {
  url: string;
  depth: number;
  referrer: string | null;
}

export class CrawlQueue {
  private readonly items: QueueItem[] = [];
  private readonly seen = new Set<string>();

  has(url: string): boolean {
    return this.seen.has(url);
  }

  add(item: QueueItem): boolean {
    if (this.seen.has(item.url)) return false;
    this.seen.add(item.url);
    this.items.push(item);
    return true;
  }

  markSeen(url: string): void {
    this.seen.add(url);
  }

  shift(): QueueItem | undefined {
    return this.items.shift();
  }

  get size(): number {
    return this.items.length;
  }

  get totalSeen(): number {
    return this.seen.size;
  }
}
