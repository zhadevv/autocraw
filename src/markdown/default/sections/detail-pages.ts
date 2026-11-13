import type { Section } from './types';
import { heading, truncate } from '../formatters/code';
import { keyValueList } from '../formatters/list';
import { table } from '../formatters/table';

export const detailPages: Section = ({ report, t, maxExamples }) => {
  const data = report.detail;
  const parts: string[] = [heading(2, t.detail)];
  if (!data) return `${parts[0]}\n\n${t.noData}`;
  const info = data.info;
  parts.push(
    keyValueList([
      ['Sample', data.url],
      ['Title', info.title],
      ['Alternative', info.alternative ?? ''],
      ['Rating', info.rating ?? ''],
      [t.genres, info.genres.map((genre) => genre.name).join(', ')],
      ['Tags', info.tags.slice(0, 10).join(', ')],
      ['Cover', info.cover ?? ''],
      ['Trailer', info.trailer ?? ''],
      [t.episodes, info.chapters.length],
      ['Synopsis', info.synopsis ? truncate(info.synopsis, 240) : ''],
      ['AJAX chapter endpoint', info.ajaxChapters ? `${info.ajaxChapters.method} ${info.ajaxChapters.endpoint}` : ''],
    ]),
  );
  const attributes = Object.entries(info.attributes);
  if (attributes.length > 0) {
    parts.push(heading(3, t.attributes));
    parts.push(table([t.field, t.value], attributes.map(([key, value]) => [key, truncate(value, 120)])));
  }
  if (info.chapters.length > 0) {
    parts.push(heading(3, t.episodes));
    parts.push(table(['#', 'Title', t.url, 'Date'], info.chapters.slice(0, Math.max(3, maxExamples)).map((chapter) => [chapter.number, chapter.title, chapter.url, chapter.date ?? ''])));
  }
  return parts.join('\n\n');
};
