import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { json, type Request, type Response, type NextFunction } from 'express';
import { ApiErrors } from './http';
import { AppModule } from './app.module';
import { Clinic } from './clinic';

/** Shared by production startup and HTTP tests; tests run the real Nest controllers. */
export async function createServer(clinic: Clinic) {
  const app = await NestFactory.create(AppModule.register(clinic), {
    logger: false,
    bodyParser: false,
  });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ApiErrors());
  const allowedOrigins = new Set(
    (process.env.APP_ORIGIN || 'http://localhost:3000').split(',').map((v) => v.trim()),
  );
  const attempts = new Map<string, { count: number; until: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (
        (origin && !allowedOrigins.has(origin)) ||
        req.headers['sec-fetch-site'] === 'cross-site'
      ) {
        res.status(403).json({ message: 'Request origin is not allowed' });
        return;
      }
      if (!req.is('application/json')) {
        res.status(415).json({ message: 'Send application/json' });
        return;
      }
    }
    if (
      req.path.startsWith('/api/auth/') &&
      req.method === 'POST' &&
      !req.path.endsWith('logout')
    ) {
      const key = req.socket.remoteAddress || 'local';
      const now = Date.now();
      for (const [k, value] of attempts) if (value.until < now) attempts.delete(k);
      const entry = attempts.get(key) || { count: 0, until: now + 15 * 60_000 };
      entry.count++;
      attempts.set(key, entry);
      if (entry.count > 50) {
        res.setHeader('Retry-After', Math.ceil((entry.until - now) / 1000));
        res.status(429).json({ message: 'Too many sign-in attempts. Try again in a few minutes.' });
        return;
      }
    }
    next();
  });
  app.use(json({ limit: '64kb' }));
  app.enableShutdownHooks();
  return app;
}
