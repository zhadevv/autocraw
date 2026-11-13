import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    target: 'node22',
    splitting: false,
    external: ['playwright', 'jsdom', 'openai', '@anthropic-ai/sdk', 'js-tiktoken', 'undici', 'handlebars', 'chalk', 'commander', 'zod', 'rusteerio'],
  },
  {
    entry: { cli: 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    sourcemap: true,
    target: 'node22',
    splitting: false,
    banner: { js: '#!/usr/bin/env node' },
    external: ['playwright', 'jsdom', 'openai', '@anthropic-ai/sdk', 'js-tiktoken', 'undici', 'handlebars', 'chalk', 'commander', 'zod', 'rusteerio'],
  },
]);
