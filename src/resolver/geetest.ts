import type { Frame, Page, Response as PlaywrightResponse } from 'playwright';
import { logger } from '../utils/logger';
import {
  DEFAULT_INTERVAL_MS,
  DEFAULT_TIMEOUT_MS,
  dragScan,
  frameRect,
  isGeetest,
  poll,
  readPage,
  readUserAgent,
  resolverResult,
  sleep,
} from './shared';
import type { Point, Rect, Resolver, ResolverResult, SolveOptions } from './shared';

interface GeetestLayout {
  readonly frame: Frame;
  readonly offset: Point;
  readonly target: Point;
  readonly thumb: Rect;
  readonly track: Rect;
  readonly piece: Rect;
  readonly prompt: string;
  readonly score: number;
}

interface GeetestState {
  readonly token: string | null;
  readonly success: boolean;
}

function hookGeetest(): void {
  const holder = window as unknown as {
    __gtHook?: boolean;
    __gtValidate?: unknown;
    __gtInstance?: unknown;
    initGeetest?: unknown;
    initGeetest4?: unknown;
  };
  if (holder.__gtHook) return;
  holder.__gtHook = true;

  const wrap = (name: 'initGeetest' | 'initGeetest4'): void => {
    let current = holder[name];
    try {
      Object.defineProperty(holder, name, {
        configurable: true,
        get: () => current,
        set: (value) => {
          if (typeof value !== 'function') {
            current = value;
            return;
          }
          const original = value as (...args: unknown[]) => unknown;
          current = function (this: unknown, ...args: unknown[]): unknown {
            const callback = args[args.length - 1];
            if (typeof callback === 'function') {
              args[args.length - 1] = (instance: unknown): unknown => {
                holder.__gtInstance = instance;
                const captcha = instance as { onSuccess?: (handler: () => void) => void; getValidate?: () => unknown };
                try {
                  captcha.onSuccess?.(() => {
                    try {
                      holder.__gtValidate = captcha.getValidate?.() ?? null;
                    } catch {
                      holder.__gtValidate = null;
                    }
                  });
                } catch {
                  holder.__gtValidate = null;
                }
                return (callback as (value: unknown) => unknown)(instance);
              };
            }
            return original.apply(this, args);
          };
        },
      });
    } catch {
      current = holder[name];
    }
  };

  wrap('initGeetest');
  wrap('initGeetest4');
}

export async function installGeetestHook(page: Page): Promise<void> {
  await page.addInitScript(hookGeetest);
}

async function probeFrame(frame: Frame): Promise<{ layout: GeetestLayout | null; error: string | null; prompt: string }> {
  const result = await frame.evaluate(async () => {
    const rect = (value: DOMRect): { x: number; y: number; width: number; height: number } => ({
      x: value.x, y: value.y, width: value.width, height: value.height,
    });
    const visible = (element: Element | null): element is HTMLElement => {
      if (!element) return false;
      const box = element.getBoundingClientRect();
      return box.width > 8 && box.height > 6 && getComputedStyle(element).visibility !== 'hidden';
    };
    const pick = (selectors: readonly string[]): HTMLElement | null => {
      for (const selector of selectors) {
        for (const element of Array.from(document.querySelectorAll(selector))) {
          if (visible(element)) return element as HTMLElement;
        }
      }
      return null;
    };

    const background = pick([
      'canvas.geetest_canvas_bg',
      'canvas.geetest_bg',
      '.geetest_bg canvas',
      '.geetest_canvas_bg img',
      'img.geetest_canvas_bg',
      '.geetest_bg',
      'canvas.geetest_canvas_fullbg',
    ]);
    const piece = pick([
      'canvas.geetest_canvas_slice',
      'canvas.geetest_slice',
      '.geetest_slice canvas',
      '.geetest_canvas_slice img',
      'img.geetest_canvas_slice',
      '.geetest_slice',
      '.geetest_slice_bg',
    ]);
    const thumb = pick(['.geetest_slider_button', '[class*="slider_button"]']);
    const track = pick(['.geetest_slider', '[class*="slider_track"]', '[class*="slider"]']);
    const promptElement = document.querySelector('.geetest_panel, .geetest_widget, .geetest_prompt');
    const prompt = (promptElement?.textContent ?? '').trim().slice(0, 200);

    if (!background || !piece || !thumb || !track) return { layout: null, error: 'widget-missing', prompt };

    const backgroundRect = background.getBoundingClientRect();
    const pieceRect = piece.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();

    const imageData = async (element: HTMLElement) => {
      const canvas = element.tagName === 'CANVAS' ? element as HTMLCanvasElement : element.querySelector('canvas');
      if (canvas) {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context || canvas.width < 8 || canvas.height < 8) return null;
        try {
          const data = context.getImageData(0, 0, canvas.width, canvas.height);
          return { data: data.data, width: data.width, height: data.height };
        } catch {
          return null;
        }
      }
      const image = element.tagName === 'IMG' ? element as HTMLImageElement : element.querySelector('img');
      let source = image?.src ?? '';
      if (!source) {
        const match = /url\(["']?(.+?)["']?\)/.exec(getComputedStyle(element).backgroundImage);
        if (match) source = match[1];
      }
      if (!source) return null;
      const loaded = new Image();
      loaded.crossOrigin = 'anonymous';
      loaded.src = source;
      await loaded.decode().catch(() => undefined);
      if (loaded.naturalWidth < 8 || loaded.naturalHeight < 8) return null;
      const offscreen = document.createElement('canvas');
      offscreen.width = loaded.naturalWidth;
      offscreen.height = loaded.naturalHeight;
      const context = offscreen.getContext('2d', { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(loaded, 0, 0);
      try {
        const data = context.getImageData(0, 0, offscreen.width, offscreen.height);
        return { data: data.data, width: data.width, height: data.height };
      } catch {
        return null;
      }
    };

    const backgroundImage = await imageData(background);
    const pieceImage = await imageData(piece);
    if (!backgroundImage || !pieceImage) return { layout: null, error: 'image-blocked', prompt };

    const toGray = (source: { data: Uint8ClampedArray; width: number; height: number }): Float32Array => {
      const gray = new Float32Array(source.width * source.height);
      for (let index = 0; index < gray.length; index += 1) {
        const offset = index * 4;
        gray[index] = 0.299 * source.data[offset] + 0.587 * source.data[offset + 1] + 0.114 * source.data[offset + 2];
      }
      return gray;
    };

    const sobel = (gray: Float32Array, width: number, height: number): { map: Float32Array; peak: number } => {
      const map = new Float32Array(width * height);
      let peak = 0;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const index = y * width + x;
          const gx = -gray[index - width - 1] - 2 * gray[index - 1] - gray[index + width - 1]
            + gray[index - width + 1] + 2 * gray[index + 1] + gray[index + width + 1];
          const gy = -gray[index - width - 1] - 2 * gray[index - width] - gray[index - width + 1]
            + gray[index + width - 1] + 2 * gray[index + width] + gray[index + width + 1];
          const magnitude = Math.abs(gx) + Math.abs(gy);
          map[index] = magnitude;
          if (magnitude > peak) peak = magnitude;
        }
      }
      return { map, peak };
    };

    const backgroundGray = toGray(backgroundImage);
    const pieceGray = toGray(pieceImage);
    const backgroundEdges = sobel(backgroundGray, backgroundImage.width, backgroundImage.height);
    const pieceEdges = sobel(pieceGray, pieceImage.width, pieceImage.height);
    const backgroundThreshold = Math.max(24, backgroundEdges.peak * 0.18);
    const pieceThreshold = Math.max(18, pieceEdges.peak * 0.12);
    const width = backgroundImage.width;
    const height = backgroundImage.height;
    const binary = new Uint8Array(width * height);
    for (let index = 0; index < binary.length; index += 1) {
      binary[index] = backgroundEdges.map[index] >= backgroundThreshold ? 1 : 0;
    }

    const pieceWidth = pieceImage.width;
    const pieceHeight = pieceImage.height;
    const points: Array<{ x: number; y: number }> = [];
    const stride = Math.max(1, Math.round((pieceWidth * pieceHeight) / 2600));
    for (let y = 0; y < pieceHeight; y += 1) {
      for (let x = 0; x < pieceWidth; x += 1) {
        const index = y * pieceWidth + x;
        const alpha = pieceImage.data[index * 4 + 3];
        const neighbourAlpha = (x > 0 ? pieceImage.data[(index - 1) * 4 + 3] : 255) < 128
          || (x < pieceWidth - 1 ? pieceImage.data[(index + 1) * 4 + 3] : 255) < 128
          || (y > 0 ? pieceImage.data[(index - pieceWidth) * 4 + 3] : 255) < 128
          || (y < pieceHeight - 1 ? pieceImage.data[(index + pieceWidth) * 4 + 3] : 255) < 128;
        const edge = pieceEdges.map[index] >= pieceThreshold || (alpha > 128 && neighbourAlpha);
        if (edge && (index % stride === 0)) points.push({ x, y });
      }
    }
    if (points.length < 12) return { layout: null, error: 'piece-edges-missing', prompt };

    const backgroundTop = backgroundRect.top;
    const backgroundLeft = backgroundRect.left;
    const row = Math.round(((pieceRect.top - backgroundTop) / backgroundRect.height) * height);
    const column = Math.round(((pieceRect.left - backgroundLeft) / backgroundRect.width) * width);
    const topLimit = Math.max(0, Math.min(height - pieceHeight, row - 6));
    const bottomLimit = Math.max(0, Math.min(height - pieceHeight, row + 6));
    const leftLimit = Math.max(0, Math.min(width - pieceWidth, column - 6));
    const rightLimit = Math.max(0, width - pieceWidth);

    const matches = (left: number, top: number): number => {
      let hits = 0;
      for (const point of points) {
        const x = left + point.x;
        const y = top + point.y;
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        let found = false;
        for (let dy = -1; dy <= 1 && !found; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (binary[(y + dy) * width + (x + dx)]) {
              found = true;
              break;
            }
          }
        }
        if (found) hits += 1;
      }
      return hits / points.length;
    };

    let bestLeft = leftLimit;
    let bestTop = topLimit;
    let bestScore = -1;
    for (let top = topLimit; top <= bottomLimit; top += 1) {
      for (let left = leftLimit; left <= Math.min(rightLimit, leftLimit + 280); left += 1) {
        const score = matches(left, top);
        if (score > bestScore) {
          bestScore = score;
          bestLeft = left;
          bestTop = top;
        }
      }
    }
    if (bestScore < 0.25) return { layout: null, error: 'match-failed', prompt };

    return {
      layout: {
        target: {
          x: backgroundRect.left + ((bestLeft + pieceWidth / 2) / width) * backgroundRect.width,
          y: backgroundRect.top + ((bestTop + pieceHeight / 2) / height) * backgroundRect.height,
        },
        thumb: rect(thumbRect),
        track: rect(trackRect),
        piece: rect(pieceRect),
        prompt,
        score: bestScore,
      },
      error: null,
      prompt,
    };
  }).catch(() => ({ layout: null, error: 'frame-unavailable', prompt: '' }));

  if (!result.layout) return { layout: null, error: result.error, prompt: result.prompt };
  const probe = result.layout as Omit<GeetestLayout, 'frame' | 'offset'>;
  return {
    layout: { ...probe, frame, offset: { x: 0, y: 0 } },
    error: null,
    prompt: result.prompt,
  };
}

async function locate(page: Page): Promise<{ layout: GeetestLayout | null; error: string | null; prompt: string }> {
  let error: string | null = null;
  let prompt = '';
  for (const frame of page.frames()) {
    const result = await probeFrame(frame);
    if (result.layout) {
      const box = frame === page.mainFrame() ? null : await frameRect(frame);
      if (frame !== page.mainFrame() && !box) continue;
      const offset = box ? { x: box.x, y: box.y } : { x: 0, y: 0 };
      const layout = result.layout;
      return {
        layout: {
          ...layout,
          target: { x: layout.target.x + offset.x, y: layout.target.y + offset.y },
          thumb: { ...layout.thumb, x: layout.thumb.x + offset.x, y: layout.thumb.y + offset.y },
          track: { ...layout.track, x: layout.track.x + offset.x, y: layout.track.y + offset.y },
          piece: { ...layout.piece, x: layout.piece.x + offset.x, y: layout.piece.y + offset.y },
          offset,
        },
        error: null,
        prompt: result.prompt,
      };
    }
    if (result.error && result.error !== 'widget-missing') {
      error = result.error;
      prompt = result.prompt || prompt;
    }
  }
  return { layout: null, error, prompt };
}

async function clickTrigger(page: Page): Promise<boolean> {
  for (const frame of page.frames()) {
    const box = await frame.evaluate(() => {
      const selectors = ['.geetest_radar_btn', '.geetest_btn', '.geetest_verify_btn', '.gee-test__placeholder', '[class*="radar_btn"]'];
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (!(element instanceof HTMLElement)) continue;
        const rect = element.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 6) continue;
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height };
      }
      return null;
    }).catch(() => null);
    if (!box) continue;
    const offset = frame === page.mainFrame() ? { x: 0, y: 0 } : await frameRect(frame);
    if (!offset) continue;
    await page.mouse.click(offset.x + box.x, offset.y + box.y);
    return true;
  }
  return false;
}

async function stateOf(page: Page): Promise<GeetestState> {
  for (const frame of page.frames()) {
    const state = await frame.evaluate(() => {
      const holder = window as unknown as { __gtValidate?: unknown };
      const read = (name: string): string => (document.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? '').trim();
      if (holder.__gtValidate && typeof holder.__gtValidate === 'object') {
        return { token: JSON.stringify(holder.__gtValidate), success: true };
      }
      const output = read('captcha_output');
      if (output) {
        return {
          token: JSON.stringify({
            captcha_id: read('captcha_id'),
            lot_number: read('lot_number'),
            pass_token: read('pass_token'),
            gen_time: read('gen_time'),
            captcha_output: output,
          }),
          success: true,
        };
      }
      const validate = read('geetest_validate');
      if (validate) {
        return {
          token: JSON.stringify({
            geetest_challenge: read('geetest_challenge'),
            geetest_validate: validate,
            geetest_seccode: read('geetest_seccode'),
          }),
          success: true,
        };
      }
      return {
        token: null,
        success: Boolean(document.querySelector('.geetest_success, .geetest_success_radar_tip, .geetest_panel_success')),
      };
    }).catch(() => ({ token: null, success: false }));
    if (state.token || state.success) return state;
  }
  return { token: null, success: false };
}

async function readPieceCentre(frame: Frame, offset: Point): Promise<Point | null> {
  const point = await frame.evaluate(() => {
    const selectors = ['canvas.geetest_canvas_slice', 'canvas.geetest_slice', '.geetest_slice canvas', '.geetest_canvas_slice img', 'img.geetest_canvas_slice', '.geetest_slice'];
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (!element) continue;
      const box = element.getBoundingClientRect();
      if (box.width < 4 || box.height < 4) continue;
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }
    return null;
  }).catch(() => null);
  return point ? { x: point.x + offset.x, y: point.y + offset.y } : null;
}

async function detect(page: Page): Promise<boolean> {
  return isGeetest(await readPage(page));
}

async function solve(page: Page, options: SolveOptions = {}): Promise<ResolverResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const retries = Math.max(0, options.retries ?? 0);
  const userAgent = await readUserAgent(page);
  let work = page;
  let owned = false;
  let captured: string | null = null;

  const onResponse = async (response: PlaywrightResponse): Promise<void> => {
    if (!/geetest/i.test(response.url())) return;
    if (!/validate|verify|ajax/i.test(response.url())) return;
    try {
      const body = await response.json() as Record<string, unknown>;
      const data = (body.data ?? {}) as Record<string, unknown>;
      const seccode = data.seccode ?? body.seccode;
      if (seccode && typeof seccode === 'object') {
        captured = JSON.stringify(seccode);
        return;
      }
      const validate = (typeof data.validate === 'string' ? data.validate : body.validate);
      const value = (typeof data.seccode === 'string' ? data.seccode : body.seccode);
      if (typeof validate === 'string' && typeof value === 'string') {
        captured = JSON.stringify({ geetest_challenge: String(body.challenge ?? data.challenge ?? ''), geetest_validate: validate, geetest_seccode: value });
      }
    } catch {
      return;
    }
  };

  try {
    if (options.url) {
      owned = true;
      work = await page.context().newPage();
      await installGeetestHook(work);
      await work.goto(options.url, { waitUntil: 'domcontentloaded', timeout: Math.min(timeoutMs, 45000) }).catch((error: Error) => {
        logger.warn('captcha: geetest navigation failed', error.message.split('\n')[0]);
      });
    } else {
      await work.evaluate(hookGeetest).catch(() => undefined);
    }

    work.on('response', onResponse);
    const existing = await stateOf(work);
    if (existing.token || captured) {
      return resolverResult('geetest', started, { solved: true, token: existing.token ?? captured, userAgent, method: 'hook' });
    }

    let located = await locate(work);
    if (!located.layout) {
      if (await clickTrigger(work)) {
        await sleep(1200, options.signal);
        located = await locate(work);
      }
    }

    if (!located.layout) {
      const state = await stateOf(work);
      if (state.token || captured) {
        return resolverResult('geetest', started, { solved: true, token: state.token ?? captured, userAgent, method: 'hook' });
      }
      const prompt = located.prompt.toLowerCase();
      const challenge = /icon|click|word|text|gobang|nine|match/i.test(prompt) ? 'unsupported-type' : located.error ?? 'widget-missing';
      return resolverResult('geetest', started, { userAgent, method: 'drag', challenge, detail: located.prompt || null });
    }

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const current = await locate(work);
      if (!current.layout) break;
      const layout = current.layout;
      const from = { x: layout.thumb.x + layout.thumb.width / 2, y: layout.thumb.y + layout.thumb.height / 2 };
      const to = { x: layout.track.x + layout.track.width - 8, y: from.y };
      await dragScan(work, from, to, () => readPieceCentre(layout.frame, layout.offset), layout.target, options.signal);
      logger.info('captcha: geetest drag finished', { attempt, score: Number(layout.score.toFixed(3)) });

      const deadline = Date.now() + Math.min(timeoutMs, 15000);
      while (Date.now() < deadline) {
        const state = await stateOf(work);
        if (state.token || captured) {
          return resolverResult('geetest', started, {
            solved: true,
            token: state.token ?? captured,
            userAgent,
            method: 'drag',
            detail: `score=${layout.score.toFixed(3)};attempt=${attempt + 1}`,
          });
        }
        if (state.success) break;
        await sleep(intervalMs, options.signal);
      }

      if (attempt < retries) {
        const refreshed = await work.evaluate(() => {
          const element = document.querySelector('.geetest_refresh, .geetest_panel_refresh');
          if (!(element instanceof HTMLElement)) return false;
          element.click();
          return true;
        }).catch(() => false);
        if (!refreshed) break;
        await sleep(1000, options.signal);
      }
    }

    const state = await stateOf(work);
    return resolverResult('geetest', started, {
      userAgent,
      method: 'drag',
      challenge: state.success || captured ? 'token-missing' : 'not-solved',
    });
  } finally {
    work.off('response', onResponse);
    if (owned) await work.close().catch(() => undefined);
  }
}

export const geetest: Resolver = { kind: 'geetest', detect, solve };
