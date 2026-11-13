import type { Page } from 'playwright';

export interface ScrollOptions {
  maxSteps: number;
  stepPx: number;
  delayMs: number;
}

export async function autoScroll(page: Page, options: Partial<ScrollOptions> = {}): Promise<number> {
  const config: ScrollOptions = { maxSteps: 25, stepPx: 800, delayMs: 250, ...options };
  try {
    return await page.evaluate(async (opts) => {
      let steps = 0;
      let lastHeight = 0;
      let stable = 0;
      while (steps < opts.maxSteps) {
        window.scrollBy(0, opts.stepPx);
        await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
        steps += 1;
        const height = document.documentElement.scrollHeight;
        const atBottom = window.innerHeight + window.scrollY >= height - 4;
        if (height === lastHeight && atBottom) {
          stable += 1;
          if (stable >= 2) break;
        } else {
          stable = 0;
        }
        lastHeight = height;
      }
      window.scrollTo(0, 0);
      return steps;
    }, config);
  } catch {
    return 0;
  }
}
