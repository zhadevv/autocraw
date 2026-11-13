import type { Command } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { buildConfig } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { renderTable } from '../ui/table';
import { addCommonOptions, emit } from './shared';

interface InspectCliOptions extends CommonOptions {
  json?: boolean;
  compare?: boolean;
  output?: string;
}

export function registerInspect(program: Command): void {
  const command = program
    .command('inspect')
    .description('Detect tech stack, SSR/RSC payloads and hydration traps for one URL')
    .argument('<url>', 'page URL')
    .option('--json', 'print JSON')
    .option('--compare', 'always render with a browser and compare raw vs rendered HTML')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (url: string, options: InspectCliOptions) => {
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    try {
      spinner.start('Inspecting');
      const result = await crawler.inspect(url, Boolean(options.compare));
      spinner.stop(`Inspected ${result.finalUrl} (HTTP ${result.status}, via ${result.via})`);
      if (options.json) return emit(JSON.stringify(result, null, 2), options.output);
      const lines: string[] = [];
      lines.push(chalk.bold('Rendering'), `  strategy: ${chalk.cyan(result.techstack.renderStrategy)}`, ...result.techstack.renderReasons.map((reason) => `  - ${reason}`));
      lines.push(chalk.bold('Data'), `  format: ${chalk.cyan(result.techstack.dataFormat)}`, ...result.techstack.dataReasons.map((reason) => `  - ${reason}`));
      if (result.hydration) {
        lines.push(chalk.bold('Hydration'), `  trapped: ${result.hydration.trapped ? chalk.red('yes') : chalk.green('no')}`, ...result.hydration.reasons.map((reason) => `  - ${reason}`));
      }
      lines.push('', chalk.bold('Technologies'));
      lines.push(renderTable(['Name', 'Category', 'Version', 'Conf.', 'Evidence'], result.techstack.technologies.map((tech) => [tech.name, tech.category, tech.version ?? '', `${Math.round(tech.confidence * 100)}%`, tech.evidence[0] ?? '']), 60));
      if (result.ssr.payloads.length > 0) {
        lines.push('', chalk.bold('Server payloads'));
        lines.push(renderTable(['Kind', 'Source', 'Size', 'Keys'], result.ssr.payloads.map((payload) => [payload.kind, payload.source, `${payload.sizeBytes} B`, payload.keys.slice(0, 6).join(', ')]), 60));
      }
      if (result.network.length > 0) {
        lines.push('', chalk.bold('XHR / fetch'));
        lines.push(renderTable(['Method', 'Status', 'Type', 'URL'], result.network.slice(0, 15).map((entry) => [entry.method, String(entry.status), entry.contentType, entry.url]), 80));
      }
      await emit(lines.join('\n'), options.output);
    } catch (error) {
      spinner.stop();
      throw error;
    } finally {
      await crawler.close();
    }
  });
}
