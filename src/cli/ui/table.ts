import chalk from 'chalk';

function width(text: string): number {
  return Array.from(text.replace(/\u001b\[[0-9;]*m/g, '')).length;
}

function pad(text: string, size: number): string {
  return text + ' '.repeat(Math.max(0, size - width(text)));
}

export function renderTable(headers: string[], rows: string[][], maxCol = 60): string {
  const clip = (value: string): string => (width(value) > maxCol ? `${Array.from(value).slice(0, maxCol - 1).join('')}…` : value);
  const body = rows.map((row) => row.map((cell) => clip(cell ?? '')));
  const sizes = headers.map((header, index) => Math.max(width(header), ...body.map((row) => width(row[index] ?? ''))));
  const line = (cells: string[]): string => cells.map((cell, index) => pad(cell, sizes[index] as number)).join('  ');
  return [chalk.bold(line(headers)), chalk.dim(sizes.map((size) => '─'.repeat(size)).join('  ')), ...body.map(line)].join('\n');
}
