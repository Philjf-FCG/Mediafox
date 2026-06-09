import { Request, Response, NextFunction } from 'express';

const isProd = process.env.NODE_ENV === 'production';

type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

function write(severity: Severity, message: string, extra?: Record<string, unknown>): void {
  if (isProd) {
    process.stdout.write(JSON.stringify({ severity, message, ...extra }) + '\n');
  } else {
    console.log(`[${severity}] ${message}`, extra ?? '');
  }
}

export const logger = {
  info:  (message: string, extra?: Record<string, unknown>) => write('INFO', message, extra),
  warn:  (message: string, extra?: Record<string, unknown>) => write('WARNING', message, extra),
  error: (message: string, extra?: Record<string, unknown>) => write('ERROR', message, extra),
};

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    write(
      res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARNING' : 'INFO',
      `${req.method} ${req.path}`,
      {
        httpRequest: {
          requestMethod: req.method,
          requestUrl: req.originalUrl,
          status: res.statusCode,
          latency: `${Date.now() - start}ms`,
          userAgent: req.headers['user-agent'] ?? '',
          remoteIp: (req.headers['x-forwarded-for'] as string | undefined) ?? req.ip ?? '',
        },
      }
    );
  });
  next();
}
