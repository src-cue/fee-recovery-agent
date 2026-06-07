import { inngest } from '../lib/inngest.js';
import { supabase } from '@fee-recovery/db';
import { classifyIntent } from '@fee-recovery/nlp';

async function cancelWorkflow(case_id: string, tenant_id: string, reason: string) {
  await inngest.send({ name: 'case/cancelled', data: { case_id, tenant_id, reason } });
}

export const messageInboundFn = inngest.createFunction(
  { id: 'message-inbound', retries: 2 },
  { event: 'message/inbound' },
  async ({ event, step }) => {
    const { case_id, tenant_id, text, channel } = event.data as {
      case_id: string;
      tenant_id: string;
      text: string;
      channel: string;
    };

    const result = await step.run('classify-intent', () => classifyIntent(text));

    await step.run('update-case', async () => {
      await supabase
        .from('timeline_events')
        .update({ intent: result.intent, sentiment: result.sentiment })
        .eq('case_id', case_id)
        .eq('type', 'inbound_reply')
        .eq('channel', channel)
        .order('created_at', { ascending: false })
        .limit(1);

      if (result.intent === 'paid') {
        await supabase
          .from('cases')
          .update({ status: 'RESOLVED', last_action_at: new Date().toISOString() })
          .eq('id', case_id);
        await supabase.from('timeline_events').insert({
          case_id,
          tenant_id,
          type: 'status_change',
          content: 'Auto-resolved: parent confirmed payment',
        });
        await cancelWorkflow(case_id, tenant_id, 'RESOLVED');
      } else if (result.intent === 'promise' && result.promise_date) {
        await supabase.from('timeline_events').insert({
          case_id,
          tenant_id,
          type: 'note',
          content: `Promise to pay by ${result.promise_date}`,
          metadata: { promise_date: result.promise_date },
        });
      } else if (result.intent === 'distress') {
        await supabase
          .from('cases')
          .update({ status: 'ESCALATED', last_action_at: new Date().toISOString() })
          .eq('id', case_id);
        await supabase.from('timeline_events').insert({
          case_id,
          tenant_id,
          type: 'status_change',
          content: 'Escalated: parent expressed distress',
        });
        await cancelWorkflow(case_id, tenant_id, 'ESCALATED');
      }

      // Fire ERP callback if tenant has one
      const { data: tenant } = await supabase
        .from('tenants')
        .select('callback_url, webhook_secret')
        .eq('id', tenant_id)
        .single();
      if (tenant?.callback_url) {
        const payload = JSON.stringify({
          case_id,
          intent: result.intent,
          promise_date: result.promise_date,
          timestamp: new Date().toISOString(),
        });
        const sig = await hmacSha256(tenant.webhook_secret, payload);
        await fetch(tenant.callback_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', signature: `sha256=${sig}` },
          body: payload,
        }).catch(() => null);
      }
    });

    return { intent: result.intent };
  }
);

async function hmacSha256(secret: string, data: string): Promise<string> {
  const { createHmac } = await import('crypto');
  return createHmac('sha256', secret).update(data).digest('hex');
}
