import type { DataFormat, HydrationReport, NetworkEntry, RenderStrategy, SSRReport, Technology } from '../types';

export interface RenderInput {
  ssr: SSRReport;
  hydration: HydrationReport | null;
  technologies: Technology[];
  headers: Record<string, string>;
  rawTextLength: number;
  emptyRoot: boolean;
}

export function inferRenderStrategy(input: RenderInput): { strategy: RenderStrategy; reasons: string[] } {
  const reasons: string[] = [];
  const kinds = input.ssr.detected;
  const names = new Set(input.technologies.map((tech) => tech.name));
  const cacheHeader = `${input.headers['x-nextjs-cache'] ?? ''} ${input.headers['x-vercel-cache'] ?? ''} ${input.headers['x-nextjs-prerender'] ?? ''}`.toUpperCase();
  const jsFramework = ['React', 'Vue.js', 'Angular', 'Svelte', 'SolidJS', 'Next.js', 'Nuxt', 'Remix', 'SvelteKit', 'Gatsby', 'Qwik'].some((name) => names.has(name));

  if (kinds.includes('next-app-rsc')) {
    reasons.push('React Server Components flight payload (self.__next_f) found in the HTML.');
    if (input.hydration?.trapped) reasons.push('Content still depends on client JavaScript after streaming.');
    return { strategy: 'rsc', reasons };
  }

  if (input.hydration?.trapped || (input.emptyRoot && jsFramework && !kinds.some((kind) => kind !== 'none'))) {
    reasons.push(...(input.hydration?.reasons ?? ['Root container is empty and no server payload was found.']));
    if (kinds.some((kind) => kind !== 'none')) {
      reasons.push('Hydration payload exists but visible markup is incomplete in the raw HTML.');
      return { strategy: 'hybrid', reasons };
    }
    return { strategy: 'csr', reasons };
  }

  if (kinds.includes('astro') && !input.ssr.payloads.some((payload) => payload.kind === 'astro' && Number(payload.meta.islands ?? 0) > 3)) {
    reasons.push('Astro output with few or no islands is typically statically generated.');
    return { strategy: 'ssg', reasons };
  }

  if (kinds.some((kind) => kind !== 'none')) {
    if (/HIT|STALE|PRERENDER|\b1\b/.test(cacheHeader)) {
      reasons.push(`Prerender/cache header detected (${cacheHeader.trim()}).`);
      return { strategy: 'ssg', reasons };
    }
    const nextPages = input.ssr.payloads.find((payload) => payload.kind === 'next-pages');
    if (nextPages && nextPages.meta.gsp === true) {
      reasons.push('Next.js getStaticProps flag (gsp) is set.');
      return { strategy: 'ssg', reasons };
    }
    if (nextPages && nextPages.meta.gssp === true) {
      reasons.push('Next.js getServerSideProps flag (gssp) is set.');
      return { strategy: 'ssr', reasons };
    }
    reasons.push(`Server-rendered markup with hydration payload: ${kinds.join(', ')}.`);
    return { strategy: 'ssr', reasons };
  }

  if (input.rawTextLength > 400) {
    reasons.push(`Raw HTML already contains ${input.rawTextLength} characters of visible text and no SPA hydration payload.`);
    if (jsFramework) reasons.push('A client framework is present but the document is already populated.');
    return { strategy: 'ssr', reasons };
  }

  reasons.push('Not enough signals to classify the rendering strategy.');
  return { strategy: 'unknown', reasons };
}

export interface DataInput {
  ssr: SSRReport;
  network: NetworkEntry[];
  html: string;
  technologies: Technology[];
}

export function inferDataFormat(input: DataInput): { format: DataFormat; reasons: string[] } {
  const reasons: string[] = [];
  const formats = new Set<DataFormat>();
  if (input.ssr.detected.includes('next-app-rsc')) {
    formats.add('rsc-flight');
    reasons.push('RSC flight rows (text/x-component) embedded in the document.');
  }
  const jsonKinds = input.ssr.detected.filter((kind) => kind !== 'none' && kind !== 'next-app-rsc');
  if (jsonKinds.length > 0) {
    formats.add('json-hydration');
    reasons.push(`JSON hydration payload: ${jsonKinds.join(', ')}.`);
  }
  const graphql = input.network.some((entry) => /graphql/i.test(entry.url) || /graphql/i.test(entry.postData ?? ''));
  if (graphql || /["'\/]graphql["'\/?]/.test(input.html.slice(0, 500000))) {
    formats.add('graphql');
    reasons.push(graphql ? 'GraphQL requests observed in network capture.' : 'GraphQL endpoint referenced in page scripts.');
  }
  const rest = input.network.filter((entry) => (entry.resourceType === 'xhr' || entry.resourceType === 'fetch') && /json/i.test(entry.contentType) && !/graphql/i.test(entry.url));
  if (rest.length > 0) {
    formats.add('rest-json');
    reasons.push(`${rest.length} JSON XHR/fetch call(s) observed, e.g. ${rest[0]?.url}.`);
  }
  if (input.technologies.some((tech) => tech.name === 'WordPress') && /wp-json|admin-ajax\.php/.test(input.html)) {
    formats.add('rest-json');
    reasons.push('WordPress REST or admin-ajax endpoint referenced in the page.');
  }
  if (formats.size === 0) {
    reasons.push('No hydration payloads or API calls detected; data is delivered as plain HTML.');
    return { format: 'html-only', reasons };
  }
  if (formats.size === 1) return { format: [...formats][0] as DataFormat, reasons };
  return { format: 'mixed', reasons };
}
