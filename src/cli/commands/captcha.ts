import type { Command } from 'commander';
import { Option } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { buildConfig } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { detectCaptcha, listResolvers, solveCaptcha } from '../../resolver';
import type { CaptchaKind, ResolverResult } from '../../resolver';
import { AutocrawError } from '../../utils/errors';
import { Spinner } from '../ui/spinner';
import { renderTable } from '../ui/table';
import { addCommonOptions, emit } from './shared';

interface CaptchaCliOptions extends CommonOptions {
  solve?: boolean;
  json?: boolean;
  output?: string;
}

const KIND_NOTES: Record<CaptchaKind, string> = {
  'cloudflare-challenges': 'Cloudflare interstitial: wait for cf_clearance',
  'cloudflare-turnstile': 'Cloudflare Turnstile widget: click or inject and collect the token',
  'recaptcha-v2': 'reCAPTCHA v2: checkbox or audio challenge (audio needs a transcribe callback)',
  'recaptcha-v3': 'reCAPTCHA v3: invisible, collect a token from the page',
  'recaptcha-enterprise': 'reCAPTCHA Enterprise: like v2/v3 with an enterprise sitekey',
  geetest: 'GeeTest v3/v4: slide puzzle (icon and word challenges unsupported)',
  'aws-waf': 'AWS WAF: wait for the aws-waf-token cookie, click or drag if a puzzle appears',
  wobble: 'Wobble: two-gap slide puzzle, pick the matching gap and drag',
  powblock: 'POWBlock: mine a SHA-256/512 proof of work, then submit it',
};

function kindTable(): string {
  const rows = listResolvers().map((kind) => [kind, KIND_NOTES[kind]]);
  return renderTable(['Kind', 'What it solves'], rows, 60);
}

function summaryLines(detected: readonly CaptchaKind[], result: ResolverResult | null): string {
  const lines = [chalk.bold('Captcha test')];
  if (detected.length === 0) {
    lines.push('  No supported captcha detected on this page.');
    return lines.join('\n');
  }
  lines.push(`  detected: ${detected.map((kind) => chalk.cyan(kind)).join(', ')}`);
  if (result) {
    lines.push(`  solve: ${result.solved ? chalk.green('solved') : chalk.red('not solved')} (${result.method})`);
    if (result.token) lines.push(`  token: ${result.token}`);
    if (result.challenge) lines.push(`  challenge: ${result.challenge}`);
    if (result.detail) lines.push(`  detail: ${result.detail}`);
  } else {
    lines.push('  solve: not attempted (pass --solve to try)');
  }
  return lines.join('\n');
}

export function registerCaptcha(program: Command): void {
  const command = program
    .command('captcha')
    .description('List supported captchas, or test a page for them')
    .argument('[url]', 'page URL to test (omit to list supported kinds)')
    .addOption(new Option('--solve', 'attempt to solve what is detected'))
    .option('--json', 'print the result as JSON')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (url: string | undefined, options: CaptchaCliOptions) => {
    if (!url) {
      const content = options.json ? JSON.stringify({ kinds: listResolvers().map((kind) => ({ kind, note: KIND_NOTES[kind] })) }, null, 2) : kindTable();
      await emit(content, options.output);
      return;
    }
    const config = await buildConfig({ ...options, mode: 'browser' });
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    let page = null;
    try {
      spinner.start('Testing captcha');
      page = await crawler.session.browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.min(options.timeout ?? 30000, 45000) }).catch(() => undefined);
      const detected = await detectCaptcha(page);
      let result: ResolverResult | null = null;
      if (options.solve && detected.length > 0) {
        result = await solveCaptcha(page, { kind: detected[0], timeoutMs: options.timeout, retries: options.retries });
      }
      spinner.stop(`Tested ${url}: ${detected.length > 0 ? detected.join(', ') : 'no captcha'}`);
      await emit(options.json ? JSON.stringify({ url, detected, result }, null, 2) : summaryLines(detected, result), options.output);
      if (options.solve && result && !result.solved) {
        throw new AutocrawError('E_CAPTCHA', `Captcha not solved: ${result.challenge ?? 'unknown reason'}`, {
          kind: result.kind,
          method: result.method,
          detail: result.detail,
        });
      }
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await page?.close().catch(() => undefined);
      await crawler.close();
    }
  });
}
