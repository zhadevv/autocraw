import { Command, InvalidArgumentError, Option } from 'commander';
import { writeFileAtomic } from '../../utils/fs-safe';
import { CAPTCHA_KINDS } from '../../resolver/shared';
import { collect, headerArg, intArg } from '../parsers/args';

export function addCommonOptions(command: Command, include: { session?: boolean } = {}): Command {
  let cmd = command
    .addOption(new Option('-m, --mode <mode>', 'fetch mode').choices(['http', 'browser', 'auto']).default('auto'))
    .option('--config <path>', 'path to a JSON config file')
    .option('-A, --user-agent <ua>', 'custom user agent')
    .option('--rotate-ua', 'rotate between built-in browser user agents')
    .option('--proxy <url>', 'HTTP(S) proxy URL')
    .option('--browser-path <path>', 'path to a Chrome/Chromium executable (or set AUTOCRAW_BROWSER_PATH)')
    .option('--timeout <ms>', 'request timeout in milliseconds', intArg('timeout', 1000, 300000))
    .option('--retries <n>', 'retry count for transient failures', intArg('retries', 0, 10))
    .option('--concurrency <n>', 'parallel requests', intArg('concurrency', 1, 64))
    .option('--delay <ms>', 'minimum delay between requests per host', intArg('delay', 0, 60000))
    .option('--ignore-robots', 'do not honor robots.txt')
    .option('-H, --header <header>', 'extra request header (repeatable)', headerArg, {} as Record<string, string>)
    .option('--headed', 'show the browser window')
    .option('--no-stealth', 'disable stealth patches in the browser')
    .option('--load-images', 'allow images, fonts and media in the browser')
    .option('--scroll', 'auto-scroll pages in the browser')
    .option('--locale <locale>', 'browser and Accept-Language locale')
    .addOption(new Option('--solve-captcha', 'solve a supported captcha in the browser before reading the page'))
    .addOption(new Option('--captcha-kind <kind>', 'force a captcha resolver instead of detecting').choices([...CAPTCHA_KINDS]))
    .option('-v, --verbose', 'verbose debug logging');
  if (include.session !== false) cmd = cmd.option('--session <file>', 'reuse a browser session saved with zac login (cookies and user agent)');
  return cmd;
}

export function addCrawlLimits(command: Command): Command {
  return command
    .option('--max-pages <n>', 'maximum pages to crawl', intArg('max-pages', 1, 100000))
    .option('--max-depth <n>', 'maximum link depth', intArg('max-depth', 0, 20))
    .option('--include <regex>', 'only crawl URLs matching this pattern (repeatable)', collect, [] as string[])
    .option('--exclude <regex>', 'skip URLs matching this pattern (repeatable)', collect, [] as string[])
    .option('--no-sitemap', 'do not read sitemaps');
}

export function addAiOptions(command: Command): Command {
  return command
    .addOption(new Option('--ai-provider <name>', 'AI provider').choices(['openai', 'anthropic', 'ollama']))
    .option('--api-key <key>', 'API key for the AI provider (or set OPENAI_API_KEY / ANTHROPIC_API_KEY)')
    .option('--ai-model <model>', 'model name override')
    .option('--ai-base-url <url>', 'custom API base URL')
    .option('--ai-max-input <tokens>', 'input token budget', intArg('ai-max-input', 1000, 900000))
    .option('--ai-max-output <tokens>', 'output token limit', intArg('ai-max-output', 256, 64000))
    .option('--ai-temperature <t>', 'sampling temperature', (value: string) => {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) throw new InvalidArgumentError('ai-temperature must be between 0 and 2.');
      return parsed;
    })
    .option('--ai-timeout <ms>', 'AI request timeout in milliseconds', intArg('ai-timeout', 5000, 900000))
    .option('--no-cache', 'disable the AI response cache');
}

export function addMarkdownOptions(command: Command): Command {
  command
    .addOption(new Option('--markdown <mode>', 'markdown generator').choices(['default', 'ai']).default('default'))
    .addOption(new Option('--md-template <name>', 'markdown template').choices(['site-structure', 'seo-audit', 'techstack']).default('site-structure'))
    .addOption(new Option('--lang <code>', 'report language').choices(['en', 'id']).default('en'))
    .option('--ai-fallback', 'fall back to the default generator if AI generation fails')
    .option('--no-toc', 'omit the table of contents')
    .option('--no-frontmatter', 'omit YAML frontmatter');
  return addAiOptions(command);
}

export async function emit(content: string, output?: string): Promise<void> {
  if (output) {
    await writeFileAtomic(output, content);
    process.stderr.write(`Saved ${output}\n`);
    return;
  }
  process.stdout.write(content.endsWith('\n') ? content : `${content}\n`);
}
