import type { Section } from './types';
import { heading, inline } from '../formatters/code';
import { bulletList, keyValueList } from '../formatters/list';

export const pagination: Section = ({ report, t }) => {
  const data = report.pagination;
  const parts: string[] = [heading(2, t.pagination)];
  if (!data) return `${parts[0]}\n\n${t.noData}`;
  if (!data.detected) parts.push(t.none);
  else {
    parts.push(
      keyValueList([
        [t.scheme, inline(data.scheme)],
        [t.pattern, data.pattern ? inline(data.pattern) : ''],
        [t.current, data.current],
        [t.last, data.last],
        [t.next, data.next ?? ''],
        [t.prev, data.prev ?? ''],
        ['Status', data.verified ? t.verified : t.unverified],
      ]),
    );
  }
  if (data.notes.length > 0) parts.push(bulletList(data.notes));
  return parts.join('\n\n');
};
