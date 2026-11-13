import type { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { captureLoginSession } from '../../core/login';
import { buildConfig } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { addCommonOptions } from './shared';

interface LoginCliOptions extends CommonOptions {
  session: string;
}

export function registerLogin(program: Command): void {
  const command = program
    .command('login')
    .description('Open a real browser window so you can pass a login or a captcha/Turnstile challenge yourself, then save the session for reuse')
    .argument('<url>', 'page to open')
    .requiredOption('--session <file>', 'where to save the session (cookies and user agent)');
  addCommonOptions(command, { session: false });
  command.action(async (url: string, options: LoginCliOptions) => {
    const config = await buildConfig(options);
    const result = await captureLoginSession({
      url,
      sessionFile: options.session,
      config: {
        userAgent: config.userAgent ?? null,
        rotateUserAgent: config.rotateUserAgent ?? false,
        locale: config.locale ?? 'en-US',
        proxy: config.proxy ?? null,
        browserPath: config.browserPath ?? null,
        stealth: config.stealth ?? true,
      },
      onReady: async (prompt) => {
        process.stderr.write(`${chalk.cyan(prompt)}\n`);
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        await rl.question('Press Enter here once the page looks right... ');
        rl.close();
      },
    });
    process.stderr.write(`${chalk.green('✔')} Saved ${result.cookieCount} cookie(s) for ${result.origin} to ${result.path}\n`);
    process.stderr.write(`Use it with: --session ${result.path}\n`);
  });
}
