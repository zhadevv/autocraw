import type { Command } from 'commander';
import chalk from 'chalk';
import { Autocraw } from '../../index';
import { createApiServer } from '../../server';
import { createUrlGuard } from '../../server/ssrf';
import { AutocrawError } from '../../utils/errors';
import { VERSION } from '../../version';
import { buildConfig, intArg } from '../parsers/args';
import type { CommonOptions } from '../parsers/args';
import { addCommonOptions } from './shared';

interface ServeCliOptions extends CommonOptions {
  host: string;
  port: number;
  key?: string;
  maxConcurrent: number;
  allowPrivate?: boolean;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

export function registerServe(program: Command): void {
  const command = program
    .command('serve')
    .description('Run a local REST API (scrape, map, crawl, discover, extract, batch)')
    .option('--host <host>', 'interface to bind', '127.0.0.1')
    .option('--port <port>', 'port to listen on', intArg('port', 1, 65535), 3002)
    .option('--key <token>', 'bearer token required on requests (or set AUTOCRAW_SERVER_KEY)')
    .option('--max-concurrent <n>', 'maximum simultaneous jobs', intArg('max-concurrent', 1, 64), 4)
    .option('--allow-private', 'allow fetching localhost and private network addresses (unsafe on shared servers)');
  addCommonOptions(command);
  command.action(async (options: ServeCliOptions) => {
    const key = options.key ?? process.env.AUTOCRAW_SERVER_KEY ?? null;
    if (!LOOPBACK.has(options.host) && !key) {
      throw new AutocrawError('E_CONFIG', `Refusing to listen on ${options.host} without authentication. Set --key or AUTOCRAW_SERVER_KEY.`);
    }
    const config = await buildConfig(options);
    const guard = options.allowPrivate ? undefined : createUrlGuard();
    const engine = new Autocraw(config, undefined, { urlGuard: guard });
    const server = createApiServer({ engine, apiKey: key, maxConcurrent: options.maxConcurrent, guard });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, options.host, () => resolve());
    });
    process.stderr.write(`${chalk.green('autocraw')} v${VERSION} API listening on http://${options.host}:${options.port}\n`);
    if (options.allowPrivate) process.stderr.write(`${chalk.yellow('warning')} private network access is enabled\n`);
    const stop = async (): Promise<void> => {
      server.close();
      await engine.close();
      process.exit(0);
    };
    process.once('SIGINT', () => void stop());
    process.once('SIGTERM', () => void stop());
  });
}
