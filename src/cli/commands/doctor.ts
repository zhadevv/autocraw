import type { Command } from 'commander';
import chalk from 'chalk';
import { existsSync } from 'node:fs';
import { describeBrowserPath } from '../../utils/paths';
import { HttpClient } from '../../http/client';
import { resolveConfig } from '../../config/schema';
import { ensureUrl } from '../../utils/normalize-url';
import { VERSION } from '../../version';
import { toMessage } from '../../utils/errors';
import { banner } from '../ui/banner';

interface Check {
  name: string;
  ok: boolean;
  detail: string;
  fatal: boolean;
}

function mask(value: string | undefined): string {
  if (!value) return 'not set';
  return value.length <= 8 ? '****' : `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function registerDoctor(program: Command): void {
  program
    .command('doctor')
    .description('Check the environment: Node.js, Playwright browser, API keys and network access')
    .option('--skip-network', 'skip the network check')
    .action(async (options: { skipNetwork?: boolean }) => {
      process.stderr.write(`${banner()}\n`);
      const checks: Check[] = [];
      const major = Number(process.versions.node.split('.')[0]);
      checks.push({ name: 'Node.js', ok: major >= 22, detail: `v${process.versions.node} (requires 22+)`, fatal: true });

      try {
        const playwright = await import('playwright');
        checks.push({ name: 'Playwright', ok: true, detail: 'module loaded', fatal: false });
        const custom = resolveConfig().browserPath;
        if (custom) {
          const problem = describeBrowserPath(custom);
          checks.push({ name: 'Browser (custom)', ok: problem === null, detail: problem === null ? custom : `${problem}. Use an absolute path to the binary in AUTOCRAW_BROWSER_PATH or --browser-path`, fatal: false });
        } else {
          const executable = playwright.chromium.executablePath();
          const installed = Boolean(executable) && existsSync(executable);
          checks.push({ name: 'Chromium browser', ok: installed, detail: installed ? executable : 'not installed. Run: npx playwright install chromium, or set AUTOCRAW_BROWSER_PATH', fatal: false });
        }
      } catch (error) {
        checks.push({ name: 'Playwright', ok: false, detail: `not available: ${toMessage(error)}`, fatal: false });
      }

      checks.push({ name: 'OPENAI_API_KEY', ok: Boolean(process.env.OPENAI_API_KEY), detail: process.env.OPENAI_API_KEY ? mask(process.env.OPENAI_API_KEY) : 'not set (only needed for --markdown ai with OpenAI)', fatal: false });
      checks.push({ name: 'ANTHROPIC_API_KEY', ok: Boolean(process.env.ANTHROPIC_API_KEY), detail: process.env.ANTHROPIC_API_KEY ? mask(process.env.ANTHROPIC_API_KEY) : 'not set (only needed for --markdown ai with Anthropic)', fatal: false });

      if (!options.skipNetwork) {
        const client = new HttpClient(resolveConfig({ retries: 0, timeoutMs: 10000 }));
        try {
          const result = await client.get(ensureUrl('example.com'));
          checks.push({ name: 'Network', ok: result.status < 400, detail: `HTTP ${result.status} in ${result.durationMs}ms`, fatal: true });
        } catch (error) {
          checks.push({ name: 'Network', ok: false, detail: toMessage(error), fatal: true });
        } finally {
          await client.close();
        }
      }

      for (const check of checks) {
        const mark = check.ok ? chalk.green('✔') : check.fatal ? chalk.red('✖') : chalk.yellow('!');
        process.stdout.write(`${mark} ${check.name.padEnd(20)} ${chalk.dim(check.detail)}\n`);
      }
      process.stdout.write(`\nautocraw v${VERSION}\n`);
      if (checks.some((check) => check.fatal && !check.ok)) process.exitCode = 1;
    });
}
