export type ErrorCode =
  | 'E_CONFIG'
  | 'E_HTTP'
  | 'E_NETWORK'
  | 'E_TIMEOUT'
  | 'E_BLOCKED'
  | 'E_ROBOTS'
  | 'E_PARSE'
  | 'E_BROWSER'
  | 'E_CAPTCHA'
  | 'E_AI'
  | 'E_AI_AUTH'
  | 'E_AI_RATE_LIMIT'
  | 'E_AI_CONTEXT'
  | 'E_IO'
  | 'E_INPUT';

export class AutocrawError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details: Record<string, unknown> = {}, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'AutocrawError';
    this.code = code;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

export function isAutocrawError(value: unknown): value is AutocrawError {
  return value instanceof AutocrawError;
}

export function toMessage(value: unknown): string {
  if (value instanceof Error) {
    const cause = value.cause instanceof Error ? ` (${value.cause.message})` : '';
    return `${value.message}${cause}`;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
