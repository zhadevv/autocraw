export function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return text.replace(/\|/g, '\\|').replace(/\r?\n+/g, ' ').trim();
}

export function table(headers: string[], rows: Array<Array<unknown>>): string {
  if (rows.length === 0) return '';
  const head = `| ${headers.map(escapeCell).join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${headers.map((_, index) => escapeCell(row[index])).join(' | ')} |`);
  return [head, divider, ...body].join('\n');
}
