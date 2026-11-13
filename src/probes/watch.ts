import type { MediaReport } from '../types';
import type { Session } from '../core/session';
import { detectMedia } from '../media/detector';
import { parseHtml } from '../utils/dom';

export async function inspectMediaPage(session: Session, url: string, followFrames = false): Promise<MediaReport> {
  const { result, doc } = await session.document(url);
  const report = detectMedia(result.body, result.finalUrl, doc);
  if (!followFrames) return report;
  const manifests: string[] = [];
  const frames = report.sources.filter((source) => source.kind === 'iframe').slice(0, 4);
  for (const frame of frames) {
    try {
      const frameResult = await session.fetch(frame.url, { referer: result.finalUrl, mode: 'http', skipRobots: true });
      if (frameResult.status >= 400) continue;
      const nested = detectMedia(frameResult.body, frameResult.finalUrl, parseHtml(frameResult.body, frameResult.finalUrl));
      for (const source of nested.sources) {
        if (!report.sources.some((existing) => existing.url === source.url)) report.sources.push({ ...source, origin: `frame:${frame.hoster ?? 'unknown'}` });
      }
      for (const hint of nested.encryption) {
        if (!report.encryption.some((existing) => existing.type === hint.type)) report.encryption.push(hint);
      }
    } catch {
      continue;
    }
  }
  const hls = report.sources.filter((source) => source.kind === 'hls').slice(0, 2);
  for (const source of hls) {
    try {
      const manifest = await session.fetch(source.url, { referer: result.finalUrl, mode: 'http', skipRobots: true });
      if (manifest.status < 400 && manifest.body.startsWith('#EXTM3U')) manifests.push(manifest.body);
    } catch {
      continue;
    }
  }
  if (manifests.length > 0) {
    const withManifests = detectMedia('', result.finalUrl, parseHtml('<html></html>', result.finalUrl), manifests);
    for (const hint of withManifests.encryption) {
      if (!report.encryption.some((existing) => existing.type === hint.type)) report.encryption.push(hint);
    }
  }
  report.hosters = [...new Set(report.sources.map((source) => source.hoster).filter((name): name is string => Boolean(name)))];
  return report;
}
