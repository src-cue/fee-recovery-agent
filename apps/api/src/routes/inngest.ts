import type { FastifyInstance } from 'fastify';
import { serve } from 'inngest/fastify';
import { inngest } from '../lib/inngest.js';
import { caseCreatedFn } from '../../src/functions/case-created.js';
import { messageInboundFn } from '../../src/functions/message-inbound.js';
import { callCompletedFn } from '../../src/functions/call-completed.js';

export async function inngestRoutes(app: FastifyInstance) {
  const handler = serve({ client: inngest, functions: [caseCreatedFn, messageInboundFn, callCompletedFn] });
  app.route({
    method: ['GET', 'POST', 'PUT'],
    url: '/inngest',
    handler: async (req, reply) => {
      return handler(req, reply);
    },
  });
}
