import type { Command } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { buildConfig } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { Spinner } from '../ui/spinner';
import { renderTable } from '../ui/table';
import { addCommonOptions, emit } from './shared';

interface MediaCliOptions extends CommonOptions {
  json?: boolean;
  followFrames?: boolean;
  output?: string;
}

export function registerMedia(program: Command): void {
  const command = program
    .command('media')
    .description('Inspect a watch/episode page: players, mirrors, HLS/MP4 sources, hosters and encryption hints')
    .argument('<url>', 'episode or player page URL')
    .option('--follow-frames', 'also fetch embedded player iframes and HLS manifests')
    .option('--json', 'print JSON')
    .option('-o, --output <file>', 'write output to a file');
  addCommonOptions(command);
  command.action(async (url: string, options: MediaCliOptions) => {
    const config = await buildConfig(options);
    const crawler = new Autocraw(config);
    const spinner = new Spinner(true);
    try {
      spinner.start('Inspecting media');
      const report = await crawler.media(url, Boolean(options.followFrames));
      spinner.stop(`Found ${report.sources.length} media source(s)`);
      if (options.json) return emit(JSON.stringify(report, null, 2), options.output);
      const lines: string[] = [];
      if (report.sources.length > 0) {
        lines.push(renderTable(['Kind', 'Hoster', 'Origin', 'Enc.', 'URL'], report.sources.map((source) => [source.kind, source.hoster ?? '', source.origin, source.encoded ? 'yes' : '', source.url]), 80));
      } else {
        lines.push('No media sources detected in the markup. The player may load after JavaScript; try --mode browser.');
      }
      if (report.hosters.length > 0) lines.push('', `${chalk.bold('Hosters:')} ${report.hosters.join(', ')}`);
      if (report.encryption.length > 0) {
        lines.push('', chalk.bold('Encryption hints'));
        for (const hint of report.encryption) lines.push(`  ${chalk.yellow(hint.type)}  ${hint.evidence}`);
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
