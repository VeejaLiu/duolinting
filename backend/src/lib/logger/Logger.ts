import * as path from 'path';
import * as winston from 'winston';

// 控制台日志着色（ANSI 转义码）。
// error 级别用亮红加粗整行 + 上下分隔线 + 红底标签，在滚动日志中一眼可见；
// warn 整行黄色；info/debug 只给级别词上色，避免日常日志过于花哨。
const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    brightRed: '\x1b[91m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bgRedWhiteBold: '\x1b[41m\x1b[97m\x1b[1m',
};

const ERROR_RULE = `${ANSI.brightRed}${'━'.repeat(72)}${ANSI.reset}`;

const consoleFormat = winston.format.printf((info) => {
    const message = String(info.message);
    switch (info.level) {
        case 'error':
            return `\n${ERROR_RULE}\n${ANSI.bgRedWhiteBold} ERROR ${ANSI.reset} ${ANSI.brightRed}${ANSI.bold}${message}${ANSI.reset}\n${ERROR_RULE}`;
        case 'warn':
            return `${ANSI.yellow}warn: ${message}${ANSI.reset}`;
        case 'info':
            return `${ANSI.cyan}info${ANSI.reset}: ${message}`;
        default:
            return `${ANSI.gray}${info.level}${ANSI.reset}: ${message}`;
    }
});

winston.configure({
    transports: [
        new winston.transports.Console({
            level: 'debug',
            handleExceptions: true,
            format: consoleFormat,
        }),
    ],
});

/**
 * core.Log
 * ------------------------------------------------
 *
 * This is the main Logger Object. You can create a scope logger
 * or directly use the static log methods.
 *
 * By Default it uses the debug-adapter, but you are able to change
 * this in the start up process in the core/index.ts file.
 */

export class Logger {
    public static DEFAULT_SCOPE = 'app';

    private static parsePathToScope(filepath: string): string {
        if (filepath.indexOf(path.sep) >= 0) {
            filepath = filepath.replace(process.cwd(), '');
            filepath = filepath.replace(`${path.sep}src${path.sep}`, '');
            filepath = filepath.replace(`${path.sep}dist${path.sep}`, '');
            filepath = filepath.replace('.ts', '');
            filepath = filepath.replace('.js', '');
            filepath = filepath.replace(path.sep, ':');
        }
        return filepath;
    }

    private scope: string;

    constructor(scope?: string) {
        this.scope = Logger.parsePathToScope(scope ? scope : Logger.DEFAULT_SCOPE);
    }

    public debug(message: string, ...args: any[]): void {
        this.log('debug', message, args);
    }

    public info(message: string, ...args: any[]): void {
        this.log('info', message, args);
    }

    public warn(message: string, ...args: any[]): void {
        this.log('warn', message, args);
    }

    public error(message: string, ...args: any[]): void {
        this.log('error', message, args);
    }

    private log(level: string, message: string, args: any[]): void {
        if (winston) {
            winston.log(level, `${this.formatScope()} ${message}`, args);
        }
    }

    private formatScope(): string {
        return `[${this.scope}]`;
    }
}
