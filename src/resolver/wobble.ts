import type { Page, Response as PlaywrightResponse } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  dragScan,
  isWobble,
  poll,
  readPage,
  readUserAgent,
  resolverResult,
  sleep,
} from './shared';
import type { Point, Rect, Resolver, ResolverResult, SolveOptions } from './shared';

function hookWobble(): void {
  const holder = window as unknown as { __wcHook?: boolean; __wcToken?: string | null };
  if (holder.__wcHook) return;
  holder.__wcHook = true;
  document.addEventListener('captcha:success', (event) => {
    const detail = (event as CustomEvent<{ verificationToken?: unknown }>).detail;
    if (detail && typeof detail.verificationToken === 'string') holder.__wcToken = detail.verificationToken;
  }, true);
}

async function widgetToken(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const value = (window as unknown as { __wcToken?: unknown }).__wcToken;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }).catch(() => null);
}

interface WobbleProbe {
  readonly error: string | null;
  readonly candidates: number;
  readonly confidence: number;
  readonly target: Point | null;
  readonly stage: Rect | null;
  readonly piece: Rect | null;
  readonly thumb: Rect | null;
  readonly slider: Rect | null;
}

async function probe(page: Page): Promise<WobbleProbe> {
  return page.evaluate(async () => {
    const rect = (value: DOMRect): { x: number; y: number; width: number; height: number } => ({
      x: value.x, y: value.y, width: value.width, height: value.height,
    });
    const stage = document.querySelector<HTMLElement>('.wc-stage');
    const background = document.querySelector<HTMLImageElement>('.wc-background');
    const piece = document.querySelector<HTMLImageElement>('.wc-piece');
    const thumb = document.querySelector<HTMLElement>('.wc-thumb');
    const slider = document.querySelector<HTMLElement>('.wc-slider');
    const empty: WobbleProbe = { error: 'widget-missing', candidates: 0, confidence: 0, target: null, stage: null, piece: null, thumb: null, slider: null };
    if (!stage || !background || !piece || !thumb || !slider) return empty;

    const stageRect = stage.getBoundingClientRect();
    const pieceRect = piece.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const sliderRect = slider.getBoundingClientRect();
    const frames: Pick<WobbleProbe, 'stage' | 'piece' | 'thumb' | 'slider'> = {
      stage: rect(stageRect), piece: rect(pieceRect), thumb: rect(thumbRect), slider: rect(sliderRect),
    };

    if (!background.complete) await background.decode().catch(() => undefined);
    const width = background.naturalWidth || Math.round(stageRect.width);
    const height = background.naturalHeight || Math.round(stageRect.height);
    if (width < 32 || height < 32) return { ...empty, ...frames, error: 'image-missing' };

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return { ...empty, ...frames, error: 'canvas-unavailable' };
    context.drawImage(background, 0, 0, width, height);

    let pixels: Uint8ClampedArray;
    try {
      pixels = context.getImageData(0, 0, width, height).data;
    } catch {
      return { ...empty, ...frames, error: 'image-blocked' };
    }

    const total = width * height;
    const dark = new Uint8Array(total);
    for (let index = 0; index < total; index += 1) {
      const offset = index * 4;
      const luma = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      dark[index] = luma < 52 ? 1 : 0;
    }

    const expectedWidth = (pieceRect.width / stageRect.width) * width;
    const expectedHeight = (pieceRect.height / stageRect.height) * height;
    if (expectedWidth < 8 || expectedHeight < 8) return { ...empty, ...frames, error: 'piece-missing' };

    const visited = new Uint8Array(total);
    const stack = new Int32Array(total);
    const gaps: Array<{ x: number; y: number }> = [];
    for (let seed = 0; seed < total; seed += 1) {
      if (!dark[seed] || visited[seed]) continue;
      let top = 0;
      stack[top++] = seed;
      visited[seed] = 1;
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;
      let area = 0;
      while (top > 0) {
        const index = stack[--top];
        const x = index % width;
        const y = (index / width) | 0;
        area += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const neighbours = [
          x > 0 ? index - 1 : -1,
          x < width - 1 ? index + 1 : -1,
          y > 0 ? index - width : -1,
          y < height - 1 ? index + width : -1,
        ];
        for (const next of neighbours) {
          if (next < 0 || visited[next] || !dark[next]) continue;
          visited[next] = 1;
          stack[top++] = next;
        }
      }
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      if (area < expectedWidth * expectedHeight * 0.12) continue;
      if (boxWidth < expectedWidth * 0.5 || boxWidth > expectedWidth * 1.5) continue;
      if (boxHeight < expectedHeight * 0.5 || boxHeight > expectedHeight * 1.5) continue;
      gaps.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    }

    if (gaps.length === 0) return { ...empty, ...frames, error: 'gap-not-found' };

    const pieceWidth = piece.naturalWidth || Math.round(pieceRect.width);
    const pieceHeight = piece.naturalHeight || Math.round(pieceRect.height);
    const pieceCanvas = document.createElement('canvas');
    pieceCanvas.width = pieceWidth;
    pieceCanvas.height = pieceHeight;
    const pieceContext = pieceCanvas.getContext('2d', { willReadFrequently: true });
    if (!pieceContext) return { ...empty, ...frames, error: 'canvas-unavailable' };
    pieceContext.drawImage(piece, 0, 0, pieceWidth, pieceHeight);

    let piecePixels: Uint8ClampedArray;
    try {
      piecePixels = pieceContext.getImageData(0, 0, pieceWidth, pieceHeight).data;
    } catch {
      return { ...empty, ...frames, error: 'image-blocked' };
    }

    const correlation = (centreX: number, centreY: number): number => {
      const left = Math.round(centreX - pieceWidth / 2);
      const top = Math.round(centreY - pieceHeight / 2);
      const step = Math.max(1, Math.round(Math.max(pieceWidth, pieceHeight) / 120));
      let count = 0;
      let sumBackground = 0;
      let sumPiece = 0;
      let sumBackgroundSquares = 0;
      let sumPieceSquares = 0;
      let sumProduct = 0;
      for (let y = 0; y < pieceHeight; y += step) {
        for (let x = 0; x < pieceWidth; x += step) {
          const targetX = left + x;
          const targetY = top + y;
          if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
          const pieceOffset = (y * pieceWidth + x) * 4;
          if (piecePixels[pieceOffset + 3] < 200) continue;
          const backgroundOffset = (targetY * width + targetX) * 4;
          const backgroundLuma = (pixels[backgroundOffset] + pixels[backgroundOffset + 1] + pixels[backgroundOffset + 2]) / 3;
          if (backgroundLuma < 55 || backgroundLuma > 238) continue;
          const pieceLuma = (piecePixels[pieceOffset] + piecePixels[pieceOffset + 1] + piecePixels[pieceOffset + 2]) / 3;
          count += 1;
          sumBackground += backgroundLuma;
          sumPiece += pieceLuma;
          sumBackgroundSquares += backgroundLuma * backgroundLuma;
          sumPieceSquares += pieceLuma * pieceLuma;
          sumProduct += backgroundLuma * pieceLuma;
        }
      }
      if (count < 120) return -1;
      const backgroundVariance = count * sumBackgroundSquares - sumBackground * sumBackground;
      const pieceVariance = count * sumPieceSquares - sumPiece * sumPiece;
      if (backgroundVariance <= 0 || pieceVariance <= 0) return -1;
      return (count * sumProduct - sumBackground * sumPiece) / Math.sqrt(backgroundVariance * pieceVariance);
    };

    const scored = gaps
      .map((gap) => ({ ...gap, score: correlation(gap.x, gap.y) }))
      .sort((left, right) => right.score - left.score);
    const best = scored[0];
    if (!best || best.score < 0) return { ...empty, ...frames, error: 'match-failed' };

    return {
      error: null,
      candidates: gaps.length,
      confidence: best.score - (scored[1]?.score ?? 0),
      target: {
        x: stageRect.x + (best.x / width) * stageRect.width,
        y: stageRect.y + (best.y / height) * stageRect.height,
      },
      ...frames,
    };
  });
}

async function widgetState(page: Page): Promise<string | null> {
  return page.evaluate(() => document.querySelector('.wc-card')?.getAttribute('data-state') ?? null).catch(() => null);
}

async function readPieceCentre(page: Page): Promise<Point | null> {
  return page.evaluate(() => {
    const piece = document.querySelector('.wc-piece');
    if (!piece) return null;
    const box = piece.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }).catch(() => null);
}

async function detect(page: Page): Promise<boolean> {
  return isWobble(await readPage(page));
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const retries = Math.max(0, options.retries ?? 1);
  const userAgent = await readUserAgent(page);
  let captured: string | null = null;

  const onResponse = async (response: PlaywrightResponse): Promise<void> => {
    if (response.request().method() !== 'POST') return;
    if (!/verify|validate/i.test(response.url())) return;
    try {
      const body = await response.json() as { verificationToken?: unknown };
      if (typeof body.verificationToken === 'string') captured = body.verificationToken;
    } catch {
      return;
    }
  };

  if (options.url) {
    await page.addInitScript(hookWobble);
    await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) }).catch((error: Error) => {
      logger.warn('captcha: wobble navigation failed', error.message.split('\n')[0]);
    });
  } else {
    await page.evaluate(hookWobble).catch(() => undefined);
  }

  page.on('response', onResponse);
  try {
    await poll(async () => (await widgetState(page)) === 'ready' ? 'ready' : null, Math.min(timeoutMs, 15000), intervalMs, options.signal);

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      if (attempt > 0) {
        const refreshed = await page.evaluate(() => {
          const button = document.querySelector('.wc-refresh');
          if (!(button instanceof HTMLElement)) return false;
          button.click();
          return true;
        }).catch(() => false);
        if (!refreshed) break;
        await poll(async () => (await widgetState(page)) === 'ready' ? 'ready' : null, Math.min(timeoutMs, 10000), intervalMs, options.signal);
      }

      const probeResult = await probe(page);
      if (!probeResult.target || !probeResult.thumb || !probeResult.slider || !probeResult.piece) {
        return resolverResult('wobble', started, { userAgent, method: 'drag', challenge: probeResult.error ?? 'gap-not-found' });
      }

      const thumb = probeResult.thumb;
      const slider = probeResult.slider;
      const from = { x: thumb.x + thumb.width / 2, y: thumb.y + thumb.height / 2 };
      const to = { x: slider.x + slider.width - 12, y: from.y };
      const drag = await dragScan(page, from, to, () => readPieceCentre(page), probeResult.target, options.signal);
      logger.info('captcha: wobble drag finished', { attempt, distance: Math.round(drag.distance), candidates: probeResult.candidates });

      const token = await poll(async () => captured ?? (await widgetToken(page)), Math.min(timeoutMs, 12000), intervalMs, options.signal);
      if (token) {
        return resolverResult('wobble', started, {
          solved: true,
          token,
          userAgent,
          method: 'drag',
          detail: `candidates=${probeResult.candidates};confidence=${probeResult.confidence.toFixed(3)};distance=${Math.round(drag.distance)}`,
        });
      }

      const state = await widgetState(page);
      if (state === 'success') return resolverResult('wobble', started, { userAgent, method: 'drag', challenge: 'token-missing' });
      if (state !== 'error') return resolverResult('wobble', started, { userAgent, method: 'drag', challenge: 'verify-timeout' });
      await sleep(intervalMs, options.signal);
    }

    return resolverResult('wobble', started, { userAgent, method: 'drag', challenge: 'verify-failed' });
  } finally {
    page.off('response', onResponse);
  }
}

export const wobble: Resolver = { kind: 'wobble', detect, solve };
