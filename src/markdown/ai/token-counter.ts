import { getEncoding } from 'js-tiktoken';

type Encoder = { encode(text: string): number[] };

let encoder: Encoder | null | undefined;

function getEncoder(): Encoder | null {
  if (encoder !== undefined) return encoder;
  try {
    encoder = getEncoding('o200k_base');
  } catch {
    encoder = null;
  }
  return encoder;
}

export function countTokens(text: string): number {
  if (!text) return 0;
  const enc = getEncoder();
  if (enc) {
    try {
      return enc.encode(text).length;
    } catch {
      return Math.ceil(text.length / 3.2);
    }
  }
  return Math.ceil(text.length / 3.2);
}

export function usesApproximateCounter(): boolean {
  return getEncoder() === null;
}
