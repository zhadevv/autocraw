import type { Section } from './types';
import { heading, inline } from '../formatters/code';
import { keyValueList } from '../formatters/list';

export const overview: Section = ({ report, t }) => {
  const template = report.template;
  const body = keyValueList([
    [t.target, report.target],
    [t.generated, report.generatedAt],
    [t.template, template ? `${template.name} by ${template.vendor} (${inline(template.id)}, ${(template.confidence * 100).toFixed(0)}%)` : t.none],
    [t.framework, report.techstack.primaryFramework ?? t.none],
    [t.cms, report.techstack.cms ?? t.none],
    [t.strategy, inline(report.techstack.renderStrategy)],
    [t.dataFormat, inline(report.techstack.dataFormat)],
    [t.homeStatus, `${report.home.status}`],
    [t.fetchedVia, inline(report.home.via)],
    ['Title', report.home.title ?? ''],
  ]);
  return `${heading(2, t.overview)}\n\n${body}`;
};
