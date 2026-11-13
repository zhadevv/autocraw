import type { Section } from './types';
import { heading, inline } from '../formatters/code';
import { keyValueList } from '../formatters/list';
import { table } from '../formatters/table';

export const filtersSection: Section = ({ report, t }) => {
  const data = report.filters;
  const parts: string[] = [heading(2, t.filters)];
  if (!data || !data.detected) return `${parts[0]}\n\n${t.none}`;
  parts.push(keyValueList([['Action', data.action ?? ''], [t.method, data.method], [t.sampleUrl, data.sampleUrl ?? '']]));
  parts.push(
    table(
      [t.field, 'Type', 'Multiple', t.options],
      data.controls.map((control) => [
        inline(control.name),
        control.type,
        control.multiple ? t.yes : t.no,
        `${control.options.slice(0, 12).map((option) => option.value || option.label).filter(Boolean).join(', ')}${control.options.length > 12 ? ` (+${control.options.length - 12})` : ''}`,
      ]),
    ),
  );
  return parts.join('\n\n');
};
