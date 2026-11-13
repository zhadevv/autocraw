import type { Section } from './types';
import { heading, inline } from '../formatters/code';
import { table } from '../formatters/table';

export const urlPatterns: Section = ({ report, t, maxExamples }) => {
  const parts: string[] = [heading(2, t.urlPatterns)];
  if (report.patterns.length > 0) {
    parts.push(table([t.kind, t.pattern, t.description, t.example], report.patterns.map((p) => [p.kind, inline(p.pattern), p.description, p.example ?? ''])));
  }
  if (report.urlGroups.length > 0) {
    parts.push(heading(3, 'Discovered groups'));
    parts.push(table([t.pattern, t.kind, t.count, t.example], report.urlGroups.slice(0, 25).map((g) => [inline(g.pattern), g.kind, g.count, g.examples.slice(0, Math.min(2, maxExamples)).join(' ')])));
  }
  if (parts.length === 1) parts.push(t.noData);
  return parts.join('\n\n');
};
