import { runInNewContext } from 'node:vm';
import type { SSRPayload } from '../types';

export interface FlightRow {
  id: string;
  tag: string;
  value: unknown;
}

export function capData(value: unknown, maxBytes = 20000): unknown {
  let serialized: string;
  try {
    serialized = JSON.stringify(value) ?? 'null';
  } catch {
    return { __truncated: true, bytes: 0, preview: String(value).slice(0, 500) };
  }
  if (serialized.length <= maxBytes) return value;
  return { __truncated: true, bytes: serialized.length, preview: serialized.slice(0, maxBytes) };
}

export function topKeys(value: unknown, limit = 40): string[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) return Object.keys(value as Record<string, unknown>).slice(0, limit);
  if (Array.isArray(value)) return [`array(${value.length})`];
  return [];
}

export function extractBalanced(text: string, startIndex: number): string | null {
  const open = text[startIndex];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let quote: string | null = null;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return null;
}

export function extractAssignedJson(text: string, marker: string): unknown | null {
  const index = text.indexOf(marker);
  if (index < 0) return null;
  const eq = text.indexOf('=', index + marker.length);
  if (eq < 0) return null;
  let start = eq + 1;
  while (start < text.length && /\s/.test(text[start] as string)) start += 1;
  const slice = extractBalanced(text, start);
  if (!slice) return null;
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

export function parseFlight(body: string): FlightRow[] {
  const rows: FlightRow[] = [];
  for (const line of body.split('\n')) {
    if (!line) continue;
    const match = /^([0-9a-zA-Z]+):(.*)$/s.exec(line);
    if (!match) continue;
    const id = match[1] as string;
    let payload = match[2] as string;
    let tag = '';
    const tagMatch = /^([A-Z]{1,2})(?=[\[{"0-9]|$)/.exec(payload);
    if (tagMatch) {
      tag = tagMatch[1] as string;
      payload = payload.slice(tag.length);
    }
    let value: unknown = payload;
    if (payload) {
      try {
        value = JSON.parse(payload);
      } catch {
        value = payload;
      }
    }
    rows.push({ id, tag: tag || 'J', value });
  }
  return rows;
}

function scriptTexts(doc: Document): Array<{ el: Element; text: string }> {
  return Array.from(doc.querySelectorAll('script')).map((el) => ({ el, text: el.textContent ?? '' }));
}

export function parseNextData(doc: Document): SSRPayload | null {
  const el = doc.querySelector('[id="__NEXT_DATA__"]');
  if (!el || !el.textContent) return null;
  try {
    const data = JSON.parse(el.textContent) as Record<string, unknown>;
    const props = (data.props ?? {}) as Record<string, unknown>;
    return {
      kind: 'next-pages',
      source: 'script#__NEXT_DATA__',
      sizeBytes: el.textContent.length,
      keys: topKeys(props.pageProps),
      data: capData(props.pageProps ?? data),
      meta: {
        buildId: data.buildId ?? null,
        page: data.page ?? null,
        query: data.query ?? null,
        assetPrefix: data.assetPrefix ?? null,
        isFallback: data.isFallback ?? null,
        gsp: data.gsp ?? null,
        gssp: data.gssp ?? null,
        nextExport: data.nextExport ?? null,
        runtimeConfig: data.runtimeConfig ? 'present' : null,
      },
    };
  } catch {
    return { kind: 'next-pages', source: 'script#__NEXT_DATA__', sizeBytes: el.textContent.length, keys: [], data: null, meta: { parseError: true } };
  }
}

export function parseNextFlight(doc: Document): SSRPayload | null {
  const chunks: string[] = [];
  let bootstrap = 0;
  for (const { text } of scriptTexts(doc)) {
    const trimmed = text.trim();
    if (!trimmed.startsWith('self.__next_f')) continue;
    const match = /^self\.__next_f(?:\.push)?\((\[[\s\S]*\])\)\s*;?$/.exec(trimmed);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1] as string) as unknown[];
      if (parsed[0] === 1 && typeof parsed[1] === 'string') chunks.push(parsed[1]);
      else if (parsed[0] === 0) bootstrap += 1;
    } catch {
      continue;
    }
  }
  if (chunks.length === 0 && bootstrap === 0) return null;
  const joined = chunks.join('');
  const rows = parseFlight(joined);
  const tags: Record<string, number> = {};
  for (const row of rows) tags[row.tag] = (tags[row.tag] ?? 0) + 1;
  const modules = rows.filter((row) => row.tag === 'I').length;
  return {
    kind: 'next-app-rsc',
    source: 'self.__next_f.push',
    sizeBytes: joined.length,
    keys: Object.keys(tags),
    data: capData(rows.slice(0, 60)),
    meta: { chunks: chunks.length, rows: rows.length, rowTags: tags, clientModules: modules, bootstrapChunks: bootstrap },
  };
}

export function unflattenDevalue(values: unknown[]): unknown {
  const cache = new Map<number, unknown>();
  const hydrate = (index: number): unknown => {
    if (index === -1) return undefined;
    if (index === -2) return null;
    if (index === -3) return Number.NaN;
    if (index === -4) return Number.POSITIVE_INFINITY;
    if (index === -5) return Number.NEGATIVE_INFINITY;
    if (index === -6) return -0;
    if (cache.has(index)) return cache.get(index);
    const value = values[index];
    if (value === null || typeof value !== 'object') {
      cache.set(index, value);
      return value;
    }
    if (Array.isArray(value)) {
      if (typeof value[0] === 'string') {
        const type = value[0];
        let result: unknown;
        switch (type) {
          case 'Date':
            result = new Date(String(value[1])).toISOString();
            break;
          case 'Set':
            result = [];
            cache.set(index, result);
            for (let i = 1; i < value.length; i += 1) (result as unknown[]).push(hydrate(value[i] as number));
            return result;
          case 'Map': {
            const entries: Array<[unknown, unknown]> = [];
            cache.set(index, entries);
            for (let i = 1; i < value.length; i += 2) entries.push([hydrate(value[i] as number), hydrate(value[i + 1] as number)]);
            return entries;
          }
          case 'BigInt':
            result = String(value[1]);
            break;
          case 'RegExp':
            result = `/${String(value[1])}/${String(value[2] ?? '')}`;
            break;
          case 'Reactive':
          case 'ShallowReactive':
          case 'Ref':
          case 'ShallowRef':
            result = hydrate(value[1] as number);
            break;
          case 'EmptyRef':
          case 'EmptyShallowRef':
            result = null;
            break;
          case 'null':
            result = Object.create(null);
            break;
          default:
            result = { __type: type, value: value.slice(1) };
        }
        cache.set(index, result);
        return result;
      }
      const array: unknown[] = [];
      cache.set(index, array);
      for (const item of value) array.push(hydrate(item as number));
      return array;
    }
    const object: Record<string, unknown> = {};
    cache.set(index, object);
    for (const [key, ref] of Object.entries(value as Record<string, unknown>)) object[key] = hydrate(ref as number);
    return object;
  };
  return values.length === 0 ? null : hydrate(0);
}

export function parseNuxt3(doc: Document): SSRPayload | null {
  const el = doc.querySelector('[id="__NUXT_DATA__"]');
  if (!el || !el.textContent) return null;
  try {
    const raw = JSON.parse(el.textContent) as unknown;
    const revived = Array.isArray(raw) ? unflattenDevalue(raw) : raw;
    const root = revived as Record<string, unknown> | null;
    return {
      kind: 'nuxt3',
      source: 'script#__NUXT_DATA__',
      sizeBytes: el.textContent.length,
      keys: topKeys(root?.data ?? root),
      data: capData(root),
      meta: {
        serverRendered: root?.serverRendered ?? null,
        stateKeys: topKeys(root?.state),
        payloadFormat: 'devalue',
      },
    };
  } catch {
    return { kind: 'nuxt3', source: 'script#__NUXT_DATA__', sizeBytes: el.textContent.length, keys: [], data: null, meta: { parseError: true } };
  }
}

export function parseNuxt2(doc: Document): SSRPayload | null {
  for (const { text } of scriptTexts(doc)) {
    const index = text.indexOf('window.__NUXT__');
    if (index < 0) continue;
    let data: unknown = extractAssignedJson(text, 'window.__NUXT__');
    let evaluated = false;
    if (data === null) {
      const eq = text.indexOf('=', index);
      const expression = text.slice(eq + 1).trim().replace(/;\s*$/, '');
      try {
        const value = runInNewContext(`(${expression})`, Object.create(null), {
          timeout: 750,
          contextCodeGeneration: { strings: false, wasm: false },
        });
        data = JSON.parse(JSON.stringify(value ?? null));
        evaluated = true;
      } catch {
        data = null;
      }
    }
    const root = data as Record<string, unknown> | null;
    return {
      kind: 'nuxt2',
      source: 'window.__NUXT__',
      sizeBytes: text.length,
      keys: topKeys(root?.data ?? root),
      data: capData(root),
      meta: {
        serverRendered: root?.serverRendered ?? null,
        layout: root?.layout ?? null,
        routePath: (root?.routePath as string | undefined) ?? null,
        evaluatedInSandbox: evaluated,
        parsed: data !== null,
      },
    };
  }
  return null;
}

export function parseRemix(doc: Document): SSRPayload | null {
  for (const { text } of scriptTexts(doc)) {
    if (!text.includes('__remixContext')) continue;
    const data = extractAssignedJson(text, 'window.__remixContext') as Record<string, unknown> | null;
    const state = (data?.state ?? null) as Record<string, unknown> | null;
    const loaderData = (state?.loaderData ?? null) as Record<string, unknown> | null;
    return {
      kind: 'remix',
      source: 'window.__remixContext',
      sizeBytes: text.length,
      keys: topKeys(loaderData),
      data: capData(loaderData ?? data),
      meta: {
        parsed: data !== null,
        routes: topKeys(loaderData),
        future: data?.future ?? null,
        isSpaMode: data?.isSpaMode ?? null,
      },
    };
  }
  return null;
}

export function parseSvelteKit(doc: Document): SSRPayload | null {
  const fetched = Array.from(doc.querySelectorAll('script[data-sveltekit-fetched]'));
  const hasMarker = Array.from(doc.querySelectorAll('script')).some((el) => /__sveltekit_/.test(el.textContent ?? ''));
  const attrMarker = doc.querySelector('[data-sveltekit-preload-data], [data-sveltekit-reload]') !== null;
  if (fetched.length === 0 && !hasMarker && !attrMarker) return null;
  const entries = fetched.map((el) => {
    let body: unknown = null;
    try {
      const envelope = JSON.parse(el.textContent ?? 'null') as { body?: string; status?: number } | null;
      body = envelope?.body ? safeJson(envelope.body) : null;
    } catch {
      body = null;
    }
    return { url: el.getAttribute('data-url'), body };
  });
  return {
    kind: 'sveltekit',
    source: 'script[data-sveltekit-fetched]',
    sizeBytes: fetched.reduce((total, el) => total + (el.textContent?.length ?? 0), 0),
    keys: entries.map((entry) => entry.url ?? 'unknown'),
    data: capData(entries),
    meta: { fetchedPayloads: fetched.length, bootstrapMarker: hasMarker },
  };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function parseAstro(doc: Document): SSRPayload | null {
  const islands = Array.from(doc.querySelectorAll('astro-island'));
  if (islands.length === 0) return null;
  const items = islands.slice(0, 50).map((el) => {
    const propsRaw = el.getAttribute('props');
    let props: unknown = null;
    if (propsRaw) {
      try {
        props = decodeAstroProps(JSON.parse(propsRaw));
      } catch {
        props = null;
      }
    }
    return {
      component: el.getAttribute('component-url'),
      export: el.getAttribute('component-export'),
      renderer: el.getAttribute('renderer-url'),
      client: el.getAttribute('client'),
      opts: safeJson(el.getAttribute('opts') ?? 'null'),
      props,
    };
  });
  return {
    kind: 'astro',
    source: 'astro-island',
    sizeBytes: items.reduce((total, item) => total + JSON.stringify(item.props ?? '').length, 0),
    keys: items.map((item) => item.component ?? 'inline'),
    data: capData(items),
    meta: { islands: islands.length, directives: [...new Set(items.map((item) => item.client).filter(Boolean))] },
  };
}

function decodeAstroProps(value: unknown): unknown {
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number') {
    const [type, inner] = value as [number, unknown];
    if (type === 0) return decodeAstroObject(inner);
    if (type === 1 && Array.isArray(inner)) return inner.map(decodeAstroProps);
    return inner;
  }
  return decodeAstroObject(value);
}

function decodeAstroObject(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = decodeAstroProps(item);
    return out;
  }
  return value;
}

export function parseQwik(doc: Document): SSRPayload | null {
  const container = doc.querySelector('[q\\:container]');
  const el = doc.querySelector('script[type="qwik/json"]');
  if (!container && !el) return null;
  let data: unknown = null;
  if (el?.textContent) {
    try {
      data = JSON.parse(el.textContent);
    } catch {
      data = null;
    }
  }
  return {
    kind: 'qwik',
    source: 'script[type="qwik/json"]',
    sizeBytes: el?.textContent?.length ?? 0,
    keys: topKeys(data),
    data: capData(data),
    meta: {
      containerState: container?.getAttribute('q:container') ?? null,
      version: container?.getAttribute('q:version') ?? null,
      render: container?.getAttribute('q:render') ?? null,
    },
  };
}
