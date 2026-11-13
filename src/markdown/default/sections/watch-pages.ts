import type { Section } from './types';
import { heading } from '../formatters/code';
import { keyValueList } from '../formatters/list';
import { table } from '../formatters/table';

export const watchPages: Section = ({ report, t }) => {
  const parts: string[] = [];
  if (report.watch) {
    const info = report.watch.info;
    parts.push(heading(2, t.watch));
    parts.push(
      keyValueList([
        ['Sample', report.watch.url],
        ['Title', info.title],
        ['Series', info.seriesUrl ?? ''],
        [t.prev, info.prev ?? ''],
        [t.next, info.next ?? ''],
        [t.defaultPlayer, info.defaultPlayer ?? ''],
        [t.playlist, info.playlist.length],
      ]),
    );
    if (info.mirrors.length > 0) {
      parts.push(heading(3, t.mirrors));
      parts.push(table([t.label, t.url, t.encoded], info.mirrors.map((mirror) => [mirror.label, mirror.url, mirror.encoded ? t.yes : t.no])));
    }
    if (info.downloads.length > 0) {
      parts.push(heading(3, t.downloads));
      parts.push(table([t.label, t.url], info.downloads.slice(0, 10).map((item) => [item.label, item.url])));
    }
  }
  if (report.read) {
    const info = report.read.info;
    parts.push(heading(2, t.read));
    parts.push(
      keyValueList([
        ['Sample', report.read.url],
        ['Title', info.title],
        ['Series', info.seriesUrl ?? ''],
        [t.prev, info.prev ?? ''],
        [t.next, info.next ?? ''],
        [t.pages, info.pages.length],
        ['First image', info.pages[0] ?? ''],
        ['Chapter selector options', info.chapterOptions.length],
      ]),
    );
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
};
