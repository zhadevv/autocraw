import type { Section } from './types';
import { bytes, heading, inline } from '../formatters/code';
import { bulletList } from '../formatters/list';
import { table } from '../formatters/table';

export const techstack: Section = ({ report, t }) => {
  const parts: string[] = [heading(2, t.techstack)];
  const techs = report.techstack.technologies;
  if (techs.length === 0) parts.push(t.none);
  else {
    parts.push(
      table(
        [t.name, t.category, t.version, t.confidence, t.evidence],
        techs.map((tech) => [tech.name, tech.category, tech.version ?? '', `${(tech.confidence * 100).toFixed(0)}%`, tech.evidence.slice(0, 3).join('; ')]),
      ),
    );
  }

  parts.push(heading(3, t.rendering));
  parts.push(`${t.strategy}: ${inline(report.techstack.renderStrategy)}`);
  if (report.techstack.renderReasons.length > 0) parts.push(bulletList(report.techstack.renderReasons));
  parts.push(`${t.dataFormat}: ${inline(report.techstack.dataFormat)}`);
  if (report.techstack.dataReasons.length > 0) parts.push(bulletList(report.techstack.dataReasons));

  if (report.hydration) {
    parts.push(heading(3, t.hydrationTrap));
    const h = report.hydration;
    parts.push(`${h.trapped ? t.trapped : t.notTrapped}`);
    parts.push(
      table(
        [t.field, t.value],
        [
          ['Raw text length', h.rawTextLength],
          ['Rendered text length', h.renderedTextLength],
          ['Raw links', h.rawLinkCount],
          ['Rendered links', h.renderedLinkCount],
          ['Text ratio', h.textRatio],
          ['Link ratio', h.linkRatio],
          ['Empty root', h.emptyRoot ? t.yes : t.no],
        ],
      ),
    );
    if (h.reasons.length > 0) parts.push(bulletList(h.reasons));
  }

  parts.push(heading(3, t.ssr));
  if (report.ssr.payloads.length === 0) parts.push(t.none);
  else {
    parts.push(
      table(
        [t.kind, t.source, t.size, t.keys],
        report.ssr.payloads.map((payload) => [inline(payload.kind), inline(payload.source), bytes(payload.sizeBytes), payload.keys.slice(0, 8).join(', ')]),
      ),
    );
  }

  if (report.network.length > 0) {
    parts.push(heading(3, t.endpoints));
    parts.push(table([t.method, t.url, 'Status', 'Content-Type'], report.network.slice(0, 15).map((entry) => [entry.method, entry.url, entry.status, entry.contentType])));
  }
  return parts.filter(Boolean).join('\n\n');
};
