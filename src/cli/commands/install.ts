import type { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import { pullModel } from '../../core/models';
import { bytes as formatBytes } from '../../markdown/default/formatters/code';
import { defaultCacheDir } from '../../utils/paths';
import { AutocrawError } from '../../utils/errors';

export function registerInstall(program: Command): void {
  program
    .command('install [repoOrFile]')
    .description('Without an argument: install the Chromium browser. With owner/name[:file.gguf]: download that model (alias for: zac models pull)')
    .option('--cache-dir <dir>', 'override the model cache directory, for model downloads')
    .action(async (spec: string | undefined, options: { cacheDir?: string }) => {
      if (!spec) {
        const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        const result = spawnSync(npxCmd, ['playwright', 'install', 'chromium'], { stdio: 'inherit' });
        if (result.error || (result.status ?? 1) !== 0) {
          throw new AutocrawError('E_BROWSER', 'Could not run "npx playwright install chromium" automatically. Run it yourself, or set AUTOCRAW_BROWSER_PATH to a browser you already have.', {}, result.error);
        }
        return;
      }
      const cacheDir = options.cacheDir ?? process.env.AUTOCRAW_CACHE_DIR ?? defaultCacheDir();
      const result = await pullModel(cacheDir, spec);
      process.stdout.write(`${chalk.green('✔')} Saved ${result.path} (${formatBytes(result.bytes)})\n`);
      process.stdout.write(`sha256  ${result.sha256}\n`);
    });
}
