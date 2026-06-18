import { Request, Response, NextFunction } from 'express';

type SecurityEventSeverity = 'info' | 'warning' | 'error';

interface SecurityEventOptions {
  req: Request;
  eventType: string;
  severity: SecurityEventSeverity;
  statusCode: number;
  message: string;
  metadata?: Record<string, unknown>;
}

export function logSecurityEvent({ req, eventType, severity, statusCode, message, metadata }: SecurityEventOptions): void {
  const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  const entry = {
    severity: severity === 'warning' ? 'WARNING' : severity === 'error' ? 'ERROR' : 'INFO',
    event_type: eventType,
    message,
    status_code: statusCode,
    ip,
    endpoint: `${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
    ...metadata,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

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
