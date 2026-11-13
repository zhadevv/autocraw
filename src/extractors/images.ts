import type { ImageInfo } from '../types';
import { imageUrl } from '../utils/dom';

export function extractImages(doc: Document, base: string): ImageInfo[] {
  const seen = new Set<string>();
  const images: ImageInfo[] = [];
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const url = imageUrl(img, base);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const width = Number(img.getAttribute('width'));
    const height = Number(img.getAttribute('height'));
    images.push({
      url,
      alt: (img.getAttribute('alt') ?? '').trim(),
      width: Number.isFinite(width) && width > 0 ? width : null,
      height: Number.isFinite(height) && height > 0 ? height : null,
      lazy: img.getAttribute('loading') === 'lazy' || img.hasAttribute('data-src') || img.hasAttribute('data-lazy-src'),
    });
  }
  return images;
}
