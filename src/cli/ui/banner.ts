import chalk from 'chalk';
import { VERSION } from '../../version';

export function banner(): string {
  const lines = [
    '  ___        _        ___                      ',
    ' / _ \\ _   _| |_ ___ / __\\ __ __ ___      __  ',
    '/ /_\\/| | | | __/ _ \\/ /   \'__/ _` \\ \\ /\\ / /  ',
    '/ /_\\\\ | |_| | || (_) / /___| | | (_| |\\ V  V /   ',
    '\\____/  \\__,_|\\__\\___/\\____/|_|  \\__,_| \\_/\\_/    ',
  ];
  return `${chalk.cyan(lines.join('\n'))}\n${chalk.dim(`  zac  ·  @zhadev/autocraw v${VERSION}  ·  site intelligence crawler`)}\n`;
}
