import type { Command } from 'commander';
import chalk from 'chalk';
import { listLocalModels, listOllamaModels, pullModel, removeLocalModel } from '../../core/models';
import { bytes as formatBytes } from '../../markdown/default/formatters/code';
import { defaultCacheDir } from '../../utils/paths';
import { renderTable } from '../ui/table';
import { emit } from './shared';

function cacheDirFrom(options: { cacheDir?: string }): string {
  return options.cacheDir ?? process.env.AUTOCRAW_CACHE_DIR ?? defaultCacheDir();
}

export function registerModels(program: Command): void {
  const models = program.command('models').description('Manage local GGUF models downloaded from Hugging Face');

  models
    .command('list')
    .description('List downloaded GGUF models, and Ollama models if Ollama is reachable')
    .option('--cache-dir <dir>', 'override the model cache directory')
    .option('--json', 'print JSON')
    .action(async (options: { cacheDir?: string; json?: boolean }) => {
      const cacheDir = cacheDirFrom(options);
      const local = await listLocalModels(cacheDir);
      const ollamaBase = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
      const ollama = await listOllamaModels(ollamaBase);
      if (options.json) return emit(JSON.stringify({ cacheDir, local, ollama }, null, 2));
      process.stdout.write(`${chalk.bold('GGUF files')}  (${cacheDir}/models)\n`);
      process.stdout.write(local.length > 0 ? `${renderTable(['name', 'size'], local.map((m) => [m.name, formatBytes(m.bytes)]))}\n` : '  none\n');
      process.stdout.write(`\n${chalk.bold('Ollama')}  (${ollamaBase})\n`);
      process.stdout.write(ollama === null ? '  not reachable\n' : ollama.length > 0 ? `${renderTable(['name', 'size'], ollama.map((m) => [m.name, formatBytes(m.bytes)]))}\n` : '  no models pulled yet\n');
    });

  models
    .command('pull <repoOrFile>')
    .description('Download a .gguf file from a public Hugging Face repo, for example owner/name or owner/name:file.gguf')
    .option('--cache-dir <dir>', 'override the model cache directory')
    .action(async (spec: string, options: { cacheDir?: string }) => {
      const cacheDir = cacheDirFrom(options);
      let lastPercent = -1;
      const result = await pullModel(cacheDir, spec, (progress) => {
        if (!progress.totalBytes) return;
        const percent = Math.floor((progress.receivedBytes / progress.totalBytes) * 100);
        if (percent !== lastPercent && percent % 5 === 0) {
          lastPercent = percent;
          process.stderr.write(`\r${progress.file}  ${percent}%  (${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes)})`);
        }
      });
      process.stderr.write('\n');
      process.stdout.write(`${chalk.green('✔')} Saved ${result.path} (${formatBytes(result.bytes)})\n`);
      process.stdout.write(`sha256  ${result.sha256}\n`);
      process.stdout.write(`${chalk.dim('autocraw does not verify this hash against anything; compare it yourself against the repo if you need integrity assurance.')}\n`);
      process.stdout.write(`${chalk.dim('A downloaded .gguf is only data. To use it, load it with your own inference server (for example: ollama create, or llama.cpp\'s llama-server), then point autocraw at its OpenAI-compatible endpoint with --ai-provider openai --ai-base-url, or at Ollama with --ai-provider ollama.')}\n`);
    });

  models
    .command('remove <name>')
    .description('Delete a downloaded .gguf file')
    .option('--cache-dir <dir>', 'override the model cache directory')
    .action(async (name: string, options: { cacheDir?: string }) => {
      const cacheDir = cacheDirFrom(options);
      const target = await removeLocalModel(cacheDir, name);
      process.stdout.write(`${chalk.green('✔')} Removed ${target}\n`);
    });
}
