import type { RobotsSummary } from '../types';
import type { HttpClient } from '../http/client';

const HASH = String.fromCharCode(35);

interface Rule {
  allow: boolean;
  pattern: string;
  regex: RegExp;
}

interface Group {
  agents: string[];
  rules: Rule[];
  crawlDelay: number | null;
}

function compile(pattern: string): RegExp {
  let source = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i] as string;
    if (ch === '*') source += '.*';
    else if (ch === '$' && i === pattern.length - 1) source += '$';
    else source += ch.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${source}`);
}

export class RobotsPolicy {
  readonly groups: Group[] = [];
  readonly sitemaps: string[] = [];

  constructor(text: string) {
    let current: Group | null = null;
    let lastWasAgent = false;
    for (const rawLine of text.split(/\r?\n/)) {
      const hashIndex = rawLine.indexOf(HASH);
      const line = (hashIndex >= 0 ? rawLine.slice(0, hashIndex) : rawLine).trim();
      if (!line) continue;
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const field = line.slice(0, colon).trim().toLowerCase();
      const value = line.slice(colon + 1).trim();
      if (field === 'sitemap') {
        if (value) this.sitemaps.push(value);
        continue;
      }
      if (field === 'user-agent') {
        if (!current || !lastWasAgent) {
          current = { agents: [], rules: [], crawlDelay: null };
          this.groups.push(current);
        }
        current.agents.push(value.toLowerCase());
        lastWasAgent = true;
        continue;
      }
      lastWasAgent = false;
      if (!current) continue;
      if (field === 'allow' || field === 'disallow') {
        if (field === 'disallow' && value === '') continue;
        current.rules.push({ allow: field === 'allow', pattern: value, regex: compile(value) });
      } else if (field === 'crawl-delay') {
        const seconds = Number(value);
        if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelay = seconds;
      }
    }
  }

  private groupFor(agent: string): Group | null {
    const token = agent.toLowerCase();
    let best: Group | null = null;
    let bestLength = -1;
    for (const group of this.groups) {
      for (const name of group.agents) {
        if (name === '*') {
          if (bestLength < 0) {
            best = group;
            bestLength = 0;
          }
        } else if (token.includes(name) && name.length > bestLength) {
          best = group;
          bestLength = name.length;
        }
      }
    }
    return best;
  }

  isAllowed(urlOrPath: string, agent = 'autocraw'): boolean {
    let target = urlOrPath;
    if (/^https?:/i.test(urlOrPath)) {
      try {
        const url = new URL(urlOrPath);
        target = `${url.pathname}${url.search}`;
      } catch {
        return true;
      }
    }
    const group = this.groupFor(agent);
    if (!group) return true;
    let verdict = true;
    let matchLength = -1;
    for (const rule of group.rules) {
      if (!rule.regex.test(target)) continue;
      const length = rule.pattern.length;
      if (length > matchLength || (length === matchLength && rule.allow)) {
        matchLength = length;
        verdict = rule.allow;
      }
    }
    return verdict;
  }

  crawlDelay(agent = 'autocraw'): number | null {
    return this.groupFor(agent)?.crawlDelay ?? null;
  }

  summary(url: string, found: boolean, agent = 'autocraw'): RobotsSummary {
    const group = this.groupFor(agent);
    const rules = group?.rules ?? [];
    return {
      found,
      url,
      sitemaps: [...new Set(this.sitemaps)],
      crawlDelay: group?.crawlDelay ?? null,
      disallowAll: rules.some((rule) => !rule.allow && rule.pattern === '/') && !rules.some((rule) => rule.allow && rule.pattern === '/'),
      disallowed: rules.filter((rule) => !rule.allow).map((rule) => rule.pattern).slice(0, 50),
      allowed: rules.filter((rule) => rule.allow).map((rule) => rule.pattern).slice(0, 50),
    };
  }
}

export const ALLOW_ALL = new RobotsPolicy('');

export class RobotsCache {
  private readonly cache = new Map<string, Promise<{ policy: RobotsPolicy; found: boolean; url: string }>>();

  constructor(private readonly client: HttpClient) {}

  load(origin: string): Promise<{ policy: RobotsPolicy; found: boolean; url: string }> {
    const existing = this.cache.get(origin);
    if (existing) return existing;
    const robotsUrl = new URL('/robots.txt', origin).toString();
    const pending = (async () => {
      try {
        const result = await this.client.get(robotsUrl, { retries: 1, timeoutMs: 15000, accept: 'text/plain,*/*;q=0.8' });
        if (result.status >= 200 && result.status < 300 && !result.blocked && !/<html[\s>]/i.test(result.body.slice(0, 500))) {
          return { policy: new RobotsPolicy(result.body), found: true, url: robotsUrl };
        }
        return { policy: ALLOW_ALL, found: false, url: robotsUrl };
      } catch {
        return { policy: ALLOW_ALL, found: false, url: robotsUrl };
      }
    })();
    this.cache.set(origin, pending);
    return pending;
  }

  async isAllowed(url: string, agent = 'autocraw'): Promise<boolean> {
    const { policy } = await this.load(new URL(url).origin);
    return policy.isAllowed(url, agent);
  }
}
