import type { Command } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { buildConfig } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { renderTable } from '../ui/table';
import { addCommonOptions, emit } from './shared';
import { interceptPage } from '../../browser/intercept';
import type { DomainSummary, InterceptTargetResult } from '../../browser/intercept';
import { ensureUrl } from '../../utils/normalize-url';

interface InterceptCliOptions extends CommonOptions {
  from?: string;
  noInteract?: boolean;
  clicks?: number;
  noScroll?: boolean;
  json?: boolean;
  markdown?: boolean;
  output?: string;
}

const RELATION_LABEL: Record<string, string> = { base: 'base', subdomain: 'subdomain', external: 'external' };

function bytesLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function domainTable(domains: readonly DomainSummary[]): string {
  const rows = domains.map((domain) => [
    domain.host,
    RELATION_LABEL[domain.relation],
    String(domain.requests),
    bytesLabel(domain.bytes),
    String(domain.errors),
    domain.kinds.join(', '),
  ]);
  return renderTable(['Host', 'Relation', 'Req', 'Bytes', 'Err', 'Kinds'], rows, 60);
}

function entryTable(target: InterceptTargetResult, limit = 60): string {
  if (target.entries.length === 0) return '  (no requests captured)';
  const rows = target.entries.slice(0, limit).map((entry) => [
    String(entry.status),
    entry.method,
    entry.url,
    entry.contentType || entry.resourceType,
    bytesLabel(entry.size),
    entry.kind,
  ]);
  const table = renderTable(['Status', 'Method', 'URL', 'Type', 'Size', 'Kind'], rows, 110);
  if (target.entries.length > limit) return `${table}\n  ... and ${target.entries.length - limit} more requests (use --json for all)`;
  return table;
}

function tableReport(targets: readonly InterceptTargetResult[]): string {
  const lines: string[] = [];
  for (const target of targets) {
    lines.push(chalk.bold(target.targetUrl), `  source: ${target.sourceUrl ?? '(direct load)'}  ·  ${target.totalRequests} requests, ${target.distinctHosts} hosts, ${(target.durationMs / 1000).toFixed(1)}s`);
    lines.push('', domainTable(target.domains), '', entryTable(target));
    for (const note of target.notes) lines.push(chalk.dim(`  note: ${note}`));
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function markdownReport(targets: readonly InterceptTargetResult[]): string {
  const parts: string[] = ['# Network intercept report', '', `Intercepted ${targets.length} page(s) with Playwright. Traffic was grouped by host and classified by path pattern.`, ''];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    parts.push(`## ${index + 1}. ${target.targetUrl}`, '', `- Source page: ${target.sourceUrl ?? 'direct load'}`, `- Duration: ${(target.durationMs / 1000).toFixed(1)}s`, `- Requests: ${target.totalRequests} across ${target.distinctHosts} host(s)`, '', '### Domains', '');
    parts.push('| Host | Relation | Requests | Bytes | Errors | Kinds |', '| --- | --- | ---: | ---: | ---: | --- |');
    for (const domain of target.domains) {
      parts.push(`| ${domain.host} | ${RELATION_LABEL[domain.relation]} | ${domain.requests} | ${bytesLabel(domain.bytes)} | ${domain.errors} | ${domain.kinds.join(', ')} |`);
    }
    parts.push('', '### Requests', '');
    if (target.entries.length === 0) {
      parts.push('No requests captured.');
    } else {
      parts.push('| Status | Method | URL | Type | Size | Kind |', '| --- | --- | --- | --- | ---: | --- |');
      for (const entry of target.entries) {
        parts.push(`| ${entry.status} | ${entry.method} | ${entry.url} | ${entry.contentType || entry.resourceType} | ${bytesLabel(entry.size)} | ${entry.kind} |`);
      }
    }
    if (target.notes.length > 0) {
      parts.push('', '### Notes', '');
      for (const note of target.notes) parts.push(`- ${note}`);
    }
    parts.push('');
  }
  return parts.join('\n').trimEnd();
}

export function registerIntercept(program: Command): void {
  const command = program
    .command('intercept')
    .description('Record HTTP traffic while a page loads, grouped by domain and path kind')
    .argument('<urls...>', 'page URLs to intercept (each one is loaded from the next as source)')
    .option('--from <url>', 'source page to load before the target (default: the previous URL in the list)')
    .option('--no-interact', 'skip clicks and scrolling after load')
    .option('--clicks <n>', 'how many in-page buttons to click', (value: string) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 20) throw new Error('clicks must be an integer between 0 and 20');
      return parsed;
    })
    .option('--no-scroll', 'skip scrolling to the bottom after clicks')
    .option('--json', 'print the raw result as JSON')
    .option('--markdown', 'print a markdown report instead of the table')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (urls: string[], options: InterceptCliOptions) => {
    const config = await buildConfig({ ...options, mode: 'browser' });
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    let page = null;
    try {
      spinner.start('Intercepting');
      page = await crawler.session.browser.newPage();
      const targets = urls.map(ensureUrl);
      const results: InterceptTargetResult[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        const target = targets[index];
        const source = options.from ?? (targets.length > 1 ? targets[(index + 1) % targets.length] : undefined);
        spinner.update(`Intercepting ${target}`);
        results.push(await interceptPage(page, target, {
          sourceUrl: source,
          clicks: options.clicks,
          interact: !options.noInteract,
          scroll: !options.noScroll,
          timeoutMs: options.timeout,
        }));
      }
      const total = results.reduce((sum, result) => sum + result.totalRequests, 0);
      spinner.stop(`Intercepted ${results.length} page(s), ${total} requests`);
      const content = options.json ? JSON.stringify(results, null, 2) : options.markdown ? markdownReport(results) : tableReport(results);
      await emit(content, options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await page?.close().catch(() => undefined);
      await crawler.close();
    }
  });
}
