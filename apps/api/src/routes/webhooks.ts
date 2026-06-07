import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import { inngest } from '../lib/inngest.js';
import { GupshupProvider } from '@fee-recovery/providers';
import { Dialog360Provider } from '@fee-recovery/providers';
import { TwilioWAProvider } from '@fee-recovery/providers';
import { ExotelProvider } from '@fee-recovery/providers';
import { TwilioCallingProvider } from '@fee-recovery/providers';
import { PlivoProvider } from '@fee-recovery/providers';

const gupshup = new GupshupProvider();
const dialog360 = new Dialog360Provider();
const twilioWA = new TwilioWAProvider();
const exotel = new ExotelProvider();
const twilioCall = new TwilioCallingProvider();
const plivo = new PlivoProvider();

export async function webhookRoutes(app: FastifyInstance) {
  // Respond 200 fast, process async — per spec requirement
  app.post('/whatsapp', async (req, reply) => {
    reply.code(200).send({ ok: true }); // respond within 200ms

    const body = req.body as Record<string, unknown>;
    const provider = detectWAProvider(body);
    let msg;
    try {
      if (provider === 'gupshup') msg = gupshup.parseInbound(body);
      else if (provider === '360dialog') msg = dialog360.parseInbound(body);
      else msg = twilioWA.parseInbound(body);
    } catch {
      return;
    }

    // Deduplicate via timeline_events unique index on message_id
    const { data: dupe } = await supabase
      .from('timeline_events')
      .select('id')
      .eq('message_id', msg.messageId)
      .single();
    if (dupe) return;

    // Find case by phone number
    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, tenant_id')
      .eq('parent_phone', msg.from)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!caseRow) return;

    await supabase.from('timeline_events').insert({
      case_id: caseRow.id,
      tenant_id: caseRow.tenant_id,
      type: 'inbound_reply',
      channel: 'whatsapp',
      direction: 'inbound',
      content: msg.text,
      message_id: msg.messageId,
    });

    await inngest.send({
      name: 'message/inbound',
      data: { case_id: caseRow.id, tenant_id: caseRow.tenant_id, text: msg.text, channel: 'whatsapp' },
    });
  });

  app.post('/call-events', async (req, reply) => {
    reply.code(200).send({ ok: true });

    const body = req.body as Record<string, string>;
    const provider = body.CallSid ? (body.CallDuration !== undefined ? 'exotel_or_twilio' : 'exotel') : 'plivo';

    let event;
    try {
      if (body.CallUUID) event = plivo.parseCallEvent(body);
      else if (body.CallSid) event = exotel.parseCallEvent(body);
      else return;
    } catch { return; }

    const { data: caseRow } = await supabase
      .from('timeline_events')
      .select('case_id, tenant_id')
      .eq('message_id', event.callSid)
      .single();
    if (!caseRow) return;

    await supabase.from('timeline_events').insert({
      case_id: caseRow.case_id,
      tenant_id: caseRow.tenant_id,
      type: 'call',
      channel: 'call',
      direction: 'outbound',
      content: `Call ${event.status}, duration: ${event.duration}s`,
      metadata: { duration: event.duration, recording_url: event.recordingUrl },
    });

    await inngest.send({
      name: 'call/completed',
      data: { case_id: caseRow.case_id, tenant_id: caseRow.tenant_id, status: event.status, duration: event.duration },
    });
  });

  app.post('/call-recording', async (_req, reply) => {
    // Recording URL stored asynchronously — just ack
    reply.code(200).send({ ok: true });
  });

  app.post('/sms-inbound', async (req, reply) => {
    reply.code(200).send({ ok: true });

    const body = req.body as Record<string, string>;
    const from = body.from ?? body.msisdn;
    const text = body.text ?? body.message;
    if (!from || !text) return;

    const { data: caseRow } = await supabase
      .from('cases')
      .select('id, tenant_id')
      .eq('parent_phone', from)
      .eq('status', 'ACTIVE')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (!caseRow) return;

    await supabase.from('timeline_events').insert({
      case_id: caseRow.id,
      tenant_id: caseRow.tenant_id,
      type: 'inbound_reply',
      channel: 'sms',
      direction: 'inbound',
      content: text,
    });

    await inngest.send({
      name: 'message/inbound',
      data: { case_id: caseRow.id, tenant_id: caseRow.tenant_id, text, channel: 'sms' },
    });
  });
}

function detectWAProvider(body: Record<string, unknown>): string {
  if (body.app) return 'gupshup';
  if (Array.isArray(body.messages)) return '360dialog';
  return 'twilio';
}
