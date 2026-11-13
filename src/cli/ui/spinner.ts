import chalk from 'chalk';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export class Spinner {
  private timer: NodeJS.Timeout | null = null;
  private frame = 0;
  private text = '';
  private readonly enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled && Boolean(process.stderr.isTTY);
  }

  start(text: string): void {
    this.text = text;
    if (!this.enabled) {
      process.stderr.write(`${chalk.dim('...')} ${text}\n`);
      return;
    }
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.frame = (this.frame + 1) % FRAMES.length;
      this.render();
    }, 80);
    this.render();
  }

  update(text: string): void {
    this.text = text;
    if (!this.enabled) {
      process.stderr.write(`${chalk.dim('...')} ${text}\n`);
      return;
    }
    this.render();
  }

  private render(): void {
    process.stderr.write(`\r\u001b[2K${chalk.cyan(FRAMES[this.frame] as string)} ${this.text}`);
  }

  stop(finalText?: string, ok = true): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stderr.write('\r\u001b[2K');
    }
    if (finalText) process.stderr.write(`${ok ? chalk.green('✔') : chalk.red('✖')} ${finalText}\n`);
  }
}
