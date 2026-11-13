import type { SSRReport, TechStackReport, Technology, HydrationReport, NetworkEntry } from '../types';
import { parseHtml } from '../utils/dom';
import { detectSSR } from '../ssr/detector';
import { SIGNATURES } from './signatures';
import type { Probe, Signature } from './signatures';
import { inferDataFormat, inferRenderStrategy } from './render-strategy';
import { visibleStats } from '../browser/hydration-trap';

export interface DetectInput {
  url: string;
  html: string;
  headers: Record<string, string>;
  hydration?: HydrationReport | null;
  network?: NetworkEntry[];
  ssr?: SSRReport;
}

interface Context {
  html: string;
  doc: Document;
  headers: Record<string, string>;
  scriptSrcs: string[];
  inline: string;
  generator: string;
  cookies: string;
  links: string[];
}

function buildContext(input: DetectInput, doc: Document): Context {
  const scriptSrcs = Array.from(doc.querySelectorAll('script[src]')).map((el) => el.getAttribute('src') ?? '');
  const inline = Array.from(doc.querySelectorAll('script:not([src])'))
    .map((el) => el.textContent ?? '')
    .join('\n')
    .slice(0, 400000);
  const links = Array.from(doc.querySelectorAll('link[href]')).map((el) => el.getAttribute('href') ?? '');
  const generator = Array.from(doc.querySelectorAll('meta[name="generator" i]'))
    .map((el) => el.getAttribute('content') ?? '')
    .join(' | ');
  return {
    html: input.html,
    doc,
    headers: input.headers,
    scriptSrcs,
    inline,
    generator,
    cookies: input.headers['set-cookie'] ?? '',
    links,
  };
}

function matches(pattern: RegExp | string, text: string): RegExpExecArray | null {
  if (typeof pattern === 'string') return null;
  pattern.lastIndex = 0;
  return pattern.exec(text);
}

function runProbe(probe: Probe, ctx: Context): { hit: boolean; evidence: string; version: string | null } {
  const miss = { hit: false, evidence: '', version: null };
  let haystack = '';
  switch (probe.source) {
    case 'html':
      haystack = ctx.html;
      break;
    case 'script-src':
      haystack = ctx.scriptSrcs.join('\n');
      break;
    case 'inline':
      haystack = ctx.inline;
      break;
    case 'link':
      haystack = ctx.links.join('\n');
      break;
    case 'cookie':
      haystack = ctx.cookies;
      break;
    case 'meta-generator':
      haystack = ctx.generator;
      break;
    case 'header':
      haystack = ctx.headers[(probe.header ?? '').toLowerCase()] ?? '';
      if (!haystack) return miss;
      break;
    case 'selector': {
      try {
        const found = ctx.doc.querySelector(probe.pattern as string);
        if (!found) return miss;
        const version = found.getAttribute('ng-version');
        return { hit: true, evidence: probe.label ?? `selector ${String(probe.pattern)}`, version };
      } catch {
        return miss;
      }
    }
  }
  const match = matches(probe.pattern, haystack);
  if (!match) return miss;
  let version: string | null = null;
  if (probe.version) {
    probe.version.lastIndex = 0;
    version = probe.version.exec(haystack)?.[1] ?? null;
  }
  const source = probe.source === 'header' ? `header ${probe.header}` : probe.source;
  return { hit: true, evidence: probe.label ?? `${source}: ${match[0].slice(0, 80)}`, version };
}

function evaluate(signature: Signature, ctx: Context): Technology | null {
  let score = 0;
  let version: string | null = null;
  const evidence: string[] = [];
  for (const probe of signature.probes) {
    const result = runProbe(probe, ctx);
    if (!result.hit) continue;
    score += probe.weight ?? 0.5;
    evidence.push(result.evidence);
    if (!version && result.version) version = result.version;
  }
  if (score === 0) return null;
  return {
    name: signature.name,
    category: signature.category,
    version,
    confidence: Number(Math.min(1, score).toFixed(2)),
    evidence: [...new Set(evidence)],
  };
}

export function detectTechStack(input: DetectInput): TechStackReport {
  const doc = parseHtml(input.html, input.url);
  const ctx = buildContext(input, doc);
  const found = new Map<string, Technology>();
  for (const signature of SIGNATURES) {
    const tech = evaluate(signature, ctx);
    if (tech && tech.confidence >= 0.4) found.set(tech.name, tech);
  }
  for (const signature of SIGNATURES) {
    const tech = found.get(signature.name);
    if (!tech || !signature.implies) continue;
    for (const impliedName of signature.implies) {
      if (found.has(impliedName)) continue;
      const implied = SIGNATURES.find((candidate) => candidate.name === impliedName);
      if (!implied) continue;
      found.set(impliedName, {
        name: impliedName,
        category: implied.category,
        version: null,
        confidence: Number(Math.min(0.6, tech.confidence * 0.7).toFixed(2)),
        evidence: [`implied by ${signature.name}`],
      });
    }
  }
  const technologies = [...found.values()].sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name));
  const primary = technologies.find((tech) => tech.category === 'meta-framework') ?? technologies.find((tech) => tech.category === 'framework') ?? null;
  const cms = technologies.find((tech) => tech.category === 'cms') ?? null;
  const ssr = input.ssr ?? detectSSR(doc, input.url);
  const stats = visibleStats(doc);
  const render = inferRenderStrategy({
    ssr,
    hydration: input.hydration ?? null,
    technologies,
    headers: input.headers,
    rawTextLength: stats.text,
    emptyRoot: stats.emptyRoot,
  });
  const data = inferDataFormat({ ssr, network: input.network ?? [], html: input.html, technologies });
  return {
    technologies,
    primaryFramework: primary?.name ?? null,
    cms: cms?.name ?? null,
    renderStrategy: render.strategy,
    renderReasons: render.reasons,
    dataFormat: data.format,
    dataReasons: data.reasons,
  };
}
