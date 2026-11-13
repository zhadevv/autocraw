import type { CrawlQueue, QueueItem } from './queue';

export async function runPool(
  queue: CrawlQueue,
  concurrency: number,
  worker: (item: QueueItem) => Promise<void>,
  shouldStop: () => boolean,
): Promise<void> {
  const active = new Set<Promise<void>>();
  for (;;) {
    while (!shouldStop() && active.size < concurrency) {
      const item = queue.shift();
      if (!item) break;
      const task: Promise<void> = worker(item)
        .catch(() => undefined)
        .finally(() => {
          active.delete(task);
        });
      active.add(task);
    }
    if (active.size === 0) break;
    await Promise.race(active);
  }
}
