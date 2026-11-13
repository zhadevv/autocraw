import type { Section } from './types';
import { heading, inline, truncate } from '../formatters/code';
import { bulletList } from '../formatters/list';
import { table } from '../formatters/table';

export const mediaSection: Section = ({ report, t }) => {
  const media = report.media;
  if (!media || (media.sources.length === 0 && media.encryption.length === 0)) return null;
  const parts: string[] = [heading(2, t.media)];
  if (media.hosters.length > 0) parts.push(`${t.hoster}: ${media.hosters.join(', ')}`);
  if (media.sources.length > 0) {
    parts.push(table([t.kind, t.hoster, t.origin, t.encoded, t.url], media.sources.slice(0, 25).map((source) => [source.kind, source.hoster ?? '', source.origin, source.encoded ? t.yes : t.no, truncate(source.url, 110)])));
  }
  if (media.encryption.length > 0) {
    parts.push(heading(3, t.encryption));
    parts.push(bulletList(media.encryption.map((hint) => `${inline(hint.type)}: ${hint.evidence}`)));
  }
  return parts.join('\n\n');
};
