export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const order: Record<LogLevel, number> = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'warn') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private emit(level: LogLevel, message: string, extra?: unknown): void {
    if (order[level] > order[this.level]) return;
    const line = extra === undefined ? message : `${message} ${typeof extra === 'string' ? extra : JSON.stringify(extra)}`;
    process.stderr.write(`[autocraw:${level}] ${line}\n`);
  }

  error(message: string, extra?: unknown): void {
    this.emit('error', message, extra);
  }

  warn(message: string, extra?: unknown): void {
    this.emit('warn', message, extra);
  }

  info(message: string, extra?: unknown): void {
    this.emit('info', message, extra);
  }

  debug(message: string, extra?: unknown): void {
    this.emit('debug', message, extra);
  }
}

export const logger = new Logger('warn');
