import type { DetailInfo, EpisodeItem, ReadInfo, SiteTemplate, WatchInfo } from '../types';
import type { Session } from '../core/session';
import { parseHtml } from '../utils/dom';
import { logger } from '../utils/logger';
import { toMessage } from '../utils/errors';

export async function loadAjaxChapters(session: Session, template: SiteTemplate, detailUrl: string, doc: Document, info: DetailInfo): Promise<EpisodeItem[]> {
  const holder = doc.querySelector('[id="manga-chapters-holder"]');
  const attempts: Array<() => Promise<string | null>> = [];
  if (info.ajaxChapters) {
    const endpoint = info.ajaxChapters.endpoint;
    attempts.push(async () => {
      const result = await session.fetch(endpoint, { method: 'POST', body: '', referer: detailUrl, xhr: true, mode: 'http' });
      return result.status < 400 ? result.body : null;
    });
  }
  const mangaId = holder?.getAttribute('data-id');
  if (mangaId) {
    attempts.push(async () => {
      const action = new URL('/wp-admin/admin-ajax.php', detailUrl).toString();
      const result = await session.fetch(action, { method: 'POST', body: new URLSearchParams({ action: 'manga_get_chapters', manga: mangaId }).toString(), referer: detailUrl, xhr: true, mode: 'http' });
      return result.status < 400 ? result.body : null;
    });
  }
  for (const attempt of attempts) {
    try {
      const body = await attempt();
      if (!body) continue;
      const chapters = template.extractChapters(parseHtml(body, detailUrl), detailUrl);
      if (chapters.length > 0) return chapters;
    } catch (error) {
      logger.debug(`ajax chapter load failed: ${toMessage(error)}`);
    }
  }
  return [];
}

export async function probeDetail(session: Session, template: SiteTemplate, url: string): Promise<{ url: string; info: DetailInfo; doc: Document } | null> {
  const { result, doc } = await session.document(url);
  if (result.status >= 400) return null;
  const info = template.extractDetail(doc, result.finalUrl);
  if (!info) return null;
  if (info.chapters.length === 0 && (info.ajaxChapters || doc.querySelector('[id="manga-chapters-holder"]'))) {
    const chapters = await loadAjaxChapters(session, template, result.finalUrl, doc, info);
    if (chapters.length > 0) {
      info.chapters = chapters;
      info.firstChapter = chapters[chapters.length - 1]?.url ?? null;
      info.lastChapter = chapters[0]?.url ?? null;
    }
  }
  return { url: result.finalUrl, info, doc };
}

export async function probeEpisode(
  session: Session,
  template: SiteTemplate,
  detail: DetailInfo,
  referer: string,
): Promise<{ watch: { url: string; info: WatchInfo } | null; read: { url: string; info: ReadInfo } | null }> {
  const target = detail.lastChapter ?? detail.chapters[0]?.url ?? null;
  if (!target) return { watch: null, read: null };
  const { result, doc } = await session.document(target, { referer });
  if (result.status >= 400) return { watch: null, read: null };
  const watchInfo = template.extractWatch(doc, result.finalUrl);
  const readInfo = template.extractRead(doc, result.finalUrl);
  return {
    watch: watchInfo ? { url: result.finalUrl, info: watchInfo } : null,
    read: readInfo ? { url: result.finalUrl, info: readInfo } : null,
  };
}
