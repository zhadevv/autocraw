import Handlebars from 'handlebars';

const layout = [
  '{{#if frontmatter}}---',
  '{{{frontmatter}}}',
  '---',
  '',
  '{{/if}}{{{title}}}',
  '',
  '{{#if toc}}{{{toc}}}',
  '',
  '{{/if}}{{#each sections}}{{{this}}}',
  '',
  '{{/each}}{{{footer}}}',
  '',
].join('\n');

const compiled = Handlebars.compile(layout, { noEscape: true });

export interface LayoutData {
  frontmatter: string | null;
  title: string;
  toc: string | null;
  sections: string[];
  footer: string;
}

export function renderLayout(data: LayoutData): string {
  return compiled(data).replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}
