import type { Command } from 'commander';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import { writeFileAtomic } from '../../utils/fs-safe';
import { AutocrawError } from '../../utils/errors';

const TEMPLATE = (serverKey: string): string => `# Created by: zac init
# This is a plain .env file: lines starting with # are comments, each setting is KEY=value.
# Leave a value empty to use the default.

# ── Browser ──────────────────────────────────────────────
# Absolute path to a Chrome or Chromium binary. Leave empty to use
# Playwright's own Chromium (install it with: zac install, or
# npx playwright install chromium).
AUTOCRAW_BROWSER_PATH=

# HTTP(S) proxy for crawling, format: protocol://user:password@host:port
AUTOCRAW_PROXY=

# Session file saved by: zac login <url> --session <file>
AUTOCRAW_SESSION_FILE=

# Where autocraw keeps its cache and downloaded models.
# Default: ~/.cache/autocraw
AUTOCRAW_CACHE_DIR=

# ── zac serve ────────────────────────────────────────────
# Bearer token required to call the local REST API. A random one
# was generated for you; change it if you like.
AUTOCRAW_SERVER_KEY=${serverKey}

# ── AI providers (used by --markdown ai and extract) ────────
# A key for either OpenAI or Anthropic; the provider is guessed
# from the key's prefix. Prefer the provider-specific keys below
# when you use both.
AUTOCRAW_API_KEY=

OPENAI_API_KEY=
OPENAI_BASE_URL=

ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=

# ── Local models via Ollama ──────────────────────────────
# If you run "ollama serve" yourself, autocraw can use it as an AI
# provider with --ai-provider ollama (no API key needed).
OLLAMA_BASE_URL=
OLLAMA_MODEL=
`;

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Create a starter .env file in the current directory')
    .option('--force', 'overwrite an existing .env')
    .action(async (options: { force?: boolean }) => {
      const path = resolve('.env');
      if (existsSync(path) && !options.force) {
        throw new AutocrawError('E_CONFIG', `${path} already exists. Edit it directly, or run "zac init --force" to replace it (this discards its current contents).`);
      }
      const serverKey = randomBytes(24).toString('base64url');
      await writeFileAtomic(path, TEMPLATE(serverKey), 0o600);
      process.stdout.write(`${chalk.green('✔')} Created ${path}\n`);
      process.stdout.write('Next: zac install              (download the browser)\n');
      process.stdout.write('      zac doctor                (check everything)\n');
      process.stdout.write('      zac discover your-site.example\n');
    });
}
