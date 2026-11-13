import type { Page } from 'playwright';
import { z } from 'zod';
import type { BrowserAction } from '../types';
import { AutocrawError } from '../utils/errors';
import { sleep } from '../utils/sleep';

const selector = z.string().min(1).max(500);

export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('wait'), ms: z.number().int().min(0).max(30000).optional(), selector: selector.optional() }),
  z.object({ type: z.literal('click'), selector }),
  z.object({ type: z.literal('type'), selector, text: z.string().max(5000) }),
  z.object({ type: z.literal('press'), key: z.string().min(1).max(50) }),
  z.object({ type: z.literal('scroll'), direction: z.enum(['down', 'up']).optional(), amount: z.number().int().min(1).max(20000).optional() }),
  z.object({ type: z.literal('hover'), selector }),
  z.object({ type: z.literal('select'), selector, value: z.string().max(500) }),
]);

export const actionsSchema = z.array(actionSchema).max(50);

export function parseActions(input: unknown): BrowserAction[] {
  const parsed = actionsSchema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue: { path: PropertyKey[]; message: string }) => `${issue.path.join('.') || 'actions'}: ${issue.message}`);
    throw new AutocrawError('E_INPUT', `Invalid actions: ${issues.join('; ')}`, { issues });
  }
  return parsed.data as BrowserAction[];
}

export async function runActions(page: Page, actions: BrowserAction[], timeoutMs: number): Promise<void> {
  for (const [index, action] of actions.entries()) {
    const limit = Math.min(timeoutMs, 15000);
    try {
      switch (action.type) {
        case 'wait':
          if (action.selector) await page.waitForSelector(action.selector, { timeout: limit });
          else await sleep(action.ms ?? 1000);
          break;
        case 'click':
          await page.click(action.selector, { timeout: limit });
          break;
        case 'type':
          await page.fill(action.selector, action.text, { timeout: limit });
          break;
        case 'press':
          await page.keyboard.press(action.key);
          break;
        case 'scroll':
          await page.mouse.wheel(0, (action.direction === 'up' ? -1 : 1) * (action.amount ?? 800));
          await sleep(250);
          break;
        case 'hover':
          await page.hover(action.selector, { timeout: limit });
          break;
        case 'select':
          await page.selectOption(action.selector, action.value, { timeout: limit });
          break;
      }
      await page.waitForLoadState('domcontentloaded', { timeout: 2000 }).catch(() => undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      throw new AutocrawError('E_BROWSER', `Action #${index + 1} (${action.type}) failed: ${message}`, { index, action }, error);
    }
  }
}
