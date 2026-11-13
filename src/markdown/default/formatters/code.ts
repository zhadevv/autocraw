const HASH = '\u0023';
const FENCE = '`'.repeat(3);

export function heading(level: number, text: string): string {
  return `${HASH.repeat(Math.min(6, Math.max(1, level)))} ${text}`;
}

export function inline(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (!text) return '';
  const ticks = text.includes('`') ? '``' : '`';
  return `${ticks}${text.replace(/\r?\n/g, ' ')}${ticks}`;
}

export function codeBlock(code: string, language = ''): string {
  return `${FENCE}${language}\n${code}\n${FENCE}`;
}

export function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
