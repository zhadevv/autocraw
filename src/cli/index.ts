import { existsSync } from 'node:fs';
import { Command } from 'commander';
import chalk from 'chalk';
import { VERSION } from '../version';
import { isAutocrawError, toMessage } from '../utils/errors';
import type { ErrorCode } from '../utils/errors';
import { registerCrawl } from './commands/crawl';
import { registerCaptcha } from './commands/captcha';
import { registerDiscover } from './commands/discover';
import { registerDoctor } from './commands/doctor';
import { registerExport } from './commands/export';
import { registerInspect } from './commands/inspect';
import { registerIntercept } from './commands/intercept';
import { registerMarkdown } from './commands/markdown';
import { registerMedia } from './commands/media';
import { registerProbe } from './commands/probe';
import { registerScrape } from './commands/scrape';
import { registerMap } from './commands/map';
import { registerBatch } from './commands/batch';
import { registerExtract } from './commands/extract';
import { registerServe } from './commands/serve';
import { registerLogin } from './commands/login';
import { registerInit } from './commands/init';
import { registerInstall } from './commands/install';
import { registerModels } from './commands/models';
import { registerSelectors } from './commands/selectors';

const HINTS: Partial<Record<ErrorCode, string>> = {
  E_BLOCKED: 'Try --mode browser, --headed, a different --proxy, or a slower --delay.',
  E_ROBOTS: 'The site disallows this path. Use --ignore-robots only if you are permitted to.',
  E_BROWSER: 'Install the browser with: npx playwright install chromium',
  E_CAPTCHA: 'Use --solve-captcha on a command that opens a browser, --headed to watch it, or --captcha-kind to force a resolver.',
  E_AI_AUTH: 'Check your API key and that it can use the selected model.',
  E_AI_RATE_LIMIT: 'Wait a moment and retry, or lower the request rate on your provider account.',
  E_AI_CONTEXT: 'Reduce the crawl size or raise --ai-max-input.',
  E_TIMEOUT: 'Increase --timeout or try --mode browser.',
};

const EXIT_CODES: Partial<Record<ErrorCode, number>> = {
  E_CONFIG: 2,
  E_INPUT: 2,
  E_BLOCKED: 3,
  E_ROBOTS: 3,
  E_HTTP: 4,
  E_NETWORK: 4,
  E_TIMEOUT: 4,
  E_BROWSER: 5,
  E_CAPTCHA: 5,
  E_AI: 6,
  E_AI_AUTH: 6,
  E_AI_RATE_LIMIT: 6,
  E_AI_CONTEXT: 6,
  E_IO: 7,
  E_PARSE: 7,
};

function loadEnv(): void {
  const file = process.env.AUTOCRAW_ENV_FILE ?? '.env';
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (error) {
    process.stderr.write(`${chalk.yellow('warning')} could not read ${file}: ${toMessage(error)}\n`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const program = new Command();
  program
    .name('zac')
    .description('Site intelligence crawler: tech stack, SSR/RSC, WordPress anime and manga templates, media and Markdown reports')
    .version(VERSION, '-V, --version')
    .showHelpAfterError()
    .configureHelp({ sortSubcommands: true });
  registerScrape(program);
  registerMap(program);
  registerBatch(program);
  registerExtract(program);
  registerServe(program);
  registerInit(program);
  registerInstall(program);
  registerModels(program);
  registerLogin(program);
  registerSelectors(program);
  registerDiscover(program);
  registerCrawl(program);
  registerCaptcha(program);
  registerInspect(program);
  registerIntercept(program);
  registerMedia(program);
  registerProbe(program);
  registerMarkdown(program);
  registerExport(program);
  registerDoctor(program);
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  if (isAutocrawError(error)) {
    process.stderr.write(`${chalk.red('error')} [${error.code}] ${error.message}\n`);
    const hint = HINTS[error.code];
    if (hint) process.stderr.write(`${chalk.dim('hint')}  ${hint}\n`);
    process.exit(EXIT_CODES[error.code] ?? 1);
  }
  process.stderr.write(`${chalk.red('error')} ${toMessage(error)}\n`);
  process.exit(1);
});
