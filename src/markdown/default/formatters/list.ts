export function bulletList(items: string[]): string {
  return items.filter((item) => item.trim().length > 0).map((item) => `- ${item}`).join('\n');
}

export function keyValueList(pairs: Array<[string, unknown]>): string {
  return pairs
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => `- **${key}:** ${String(value)}`)
    .join('\n');
}
