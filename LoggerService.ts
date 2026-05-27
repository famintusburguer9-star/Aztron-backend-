import { logger } from '../lib/logger.js';

export class LoggerService {
  private prefix: string;

  constructor(serviceName: string) {
    this.prefix = `[${serviceName}]`;
  }

  info(msg: string, data?: Record<string, unknown>): void {
    logger.info({ service: this.prefix, ...data }, msg);
  }

  warn(msg: string, data?: Record<string, unknown>): void {
    logger.warn({ service: this.prefix, ...data }, msg);
  }

  error(msg: string, data?: Record<string, unknown>): void {
    logger.error({ service: this.prefix, ...data }, msg);
  }

  debug(msg: string, data?: Record<string, unknown>): void {
    logger.debug({ service: this.prefix, ...data }, msg);
  }
}
