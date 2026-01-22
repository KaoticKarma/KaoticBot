import pino from 'pino';
import { config } from '../config/index.js';

// Always use pretty format for readability
export const logger = pino({
  level: config.NODE_ENV === 'development' ? 'debug' : 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
    },
  },
});

export const createChildLogger = (name: string) => logger.child({ module: name });
