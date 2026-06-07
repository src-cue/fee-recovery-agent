import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { Redis } from '@upstash/redis';

import { idempotencyPlugin } from './plugins/idempotency.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandler } from './plugins/error-handler.js';

import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { tenantRoutes } from './routes/tenants.js';
import { settingsRoutes } from './routes/settings.js';
import { caseRoutes } from './routes/cases.js';
import { templateRoutes } from './routes/templates.js';
import { dashboardRoutes } from './routes/dashboard.js';
import { billingRoutes } from './routes/billing.js';
import { webhookRoutes } from './routes/webhooks.js';
import { callTwimlRoutes } from './routes/call-twiml.js';
import { callQueueRoutes } from './routes/call-queue.js';
import { inngestRoutes } from './routes/inngest.js';

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });

  app.setErrorHandler(errorHandler);

  await app.register(authPlugin);
  await app.register(idempotencyPlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/v1/auth' });
  await app.register(tenantRoutes, { prefix: '/v1/tenants' });
  await app.register(settingsRoutes, { prefix: '/v1/settings' });
  await app.register(caseRoutes, { prefix: '/v1/cases' });
  await app.register(templateRoutes, { prefix: '/v1/templates' });
  await app.register(dashboardRoutes, { prefix: '/v1/dashboard' });
  await app.register(billingRoutes, { prefix: '/v1/billing' });
  await app.register(webhookRoutes, { prefix: '/v1/webhooks' });
  await app.register(callTwimlRoutes, { prefix: '/v1/webhooks' });
  await app.register(callQueueRoutes, { prefix: '/v1/call-queue' });
  await app.register(inngestRoutes, { prefix: '/api' });

  return app;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const app = await buildApp();
  await app.listen({ port: parseInt(process.env.PORT ?? '3001'), host: '0.0.0.0' });
}
