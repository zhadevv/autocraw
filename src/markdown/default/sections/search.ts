import type { Section } from './types';
import { heading, inline } from '../formatters/code';
import { bulletList, keyValueList } from '../formatters/list';

export const searchSection: Section = ({ report, t }) => {
  const data = report.search;
  const parts: string[] = [heading(2, t.search)];
  if (!data) return `${parts[0]}\n\n${t.noData}`;
  parts.push(
    keyValueList([
      [t.method, data.method],
      ['Action', data.action ?? ''],
      [t.param, data.param ? inline(data.param) : ''],
      ['Extra parameters', Object.entries(data.extraParams).map(([k, v]) => `${inline(k)}=${inline(v)}`).join(', ')],
      [t.sampleUrl, data.sampleUrl ?? ''],
      ['Sample query', data.sampleQuery ?? ''],
      [t.results, data.resultCount],
      ['Live search', data.liveSearch ? t.yes : t.no],
      ['Status', data.verified ? t.verified : t.unverified],
    ]),
  );
  if (data.notes.length > 0) parts.push(bulletList(data.notes));
  return parts.join('\n\n');
};
