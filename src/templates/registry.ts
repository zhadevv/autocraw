import type { SiteTemplate, TemplateContext } from '../types';
import { AutocrawError } from '../utils/errors';
import { AnimeStreamTemplate } from './wordpress/animestream';
import { MadaraTemplate } from './wordpress/madara';
import { GenericTemplate } from './generic';

export interface TemplateMatch {
  template: SiteTemplate;
  confidence: number;
  scores: Array<{ id: string; confidence: number }>;
}

export class TemplateRegistry {
  private readonly templates = new Map<string, SiteTemplate>();
  readonly generic: SiteTemplate = new GenericTemplate();
  static readonly MIN_CONFIDENCE = 0.5;

  constructor(includeBuiltins = true) {
    if (includeBuiltins) {
      this.register(new AnimeStreamTemplate());
      this.register(new MadaraTemplate());
    }
  }

  register(template: SiteTemplate): this {
    if (this.templates.has(template.id)) {
      throw new AutocrawError('E_CONFIG', `Template already registered: ${template.id}`);
    }
    this.templates.set(template.id, template);
    return this;
  }

  get(id: string): SiteTemplate | null {
    if (id === this.generic.id) return this.generic;
    return this.templates.get(id) ?? null;
  }

  list(): SiteTemplate[] {
    return [...this.templates.values()];
  }

  detect(ctx: TemplateContext): TemplateMatch {
    const scores = this.list().map((template) => {
      let confidence = 0;
      try {
        confidence = template.detect(ctx);
      } catch {
        confidence = 0;
      }
      return { template, confidence };
    });
    scores.sort((a, b) => b.confidence - a.confidence);
    const best = scores[0];
    const summary = scores.map((item) => ({ id: item.template.id, confidence: item.confidence }));
    if (best && best.confidence >= TemplateRegistry.MIN_CONFIDENCE) return { template: best.template, confidence: best.confidence, scores: summary };
    return { template: this.generic, confidence: best?.confidence ?? 0, scores: summary };
  }

  resolve(ctx: TemplateContext, forcedId?: string | null): TemplateMatch {
    if (forcedId) {
      const forced = this.get(forcedId);
      if (!forced) throw new AutocrawError('E_INPUT', `Unknown template "${forcedId}". Available: ${[...this.templates.keys(), this.generic.id].join(', ')}`);
      return { template: forced, confidence: 1, scores: [{ id: forced.id, confidence: 1 }] };
    }
    return this.detect(ctx);
  }
}

export const defaultRegistry = new TemplateRegistry();
