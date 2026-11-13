export function metaContent(doc: Document, selector: string): string | null {
  const value = doc.querySelector(selector)?.getAttribute('content');
  return value && value.trim() ? value.trim() : null;
}

export function collectMetaMap(doc: Document, attribute: 'property' | 'name', prefix: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const el of Array.from(doc.querySelectorAll(`meta[${attribute}^="${prefix}"]`))) {
    const key = el.getAttribute(attribute);
    const value = el.getAttribute('content');
    if (key && value && !(key in map)) map[key] = value.trim();
  }
  return map;
}

export function jsonLdBlocks(doc: Document): unknown[] {
  const blocks: unknown[] = [];
  for (const el of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    const text = el.textContent?.trim();
    if (!text) continue;
    try {
      blocks.push(JSON.parse(text));
    } catch {
      continue;
    }
  }
  return blocks;
}

export function jsonLdTypes(doc: Document): string[] {
  const types = new Set<string>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    const type = record['@type'];
    if (typeof type === 'string') types.add(type);
    else if (Array.isArray(type)) type.forEach((item) => typeof item === 'string' && types.add(item));
    if (record['@graph']) visit(record['@graph']);
  };
  jsonLdBlocks(doc).forEach(visit);
  return [...types];
}
