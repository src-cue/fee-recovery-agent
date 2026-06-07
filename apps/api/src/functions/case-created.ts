import { inngest } from '../lib/inngest.js';
import { supabase } from '@fee-recovery/db';
import { providerRouter } from '@fee-recovery/providers';
import { interpolateTemplate } from '@fee-recovery/shared';

// Terminal statuses — once reached, no more reminders should fire
const TERMINAL_STATUSES = ['RESOLVED', 'ON_HOLD', 'ESCALATED', 'PROMISE_TO_PAY'];

export const caseCreatedFn = inngest.createFunction(
  {
    id: 'case-created',
    retries: 3,
    cancelOn: [
      {
        event: 'case/cancelled',
        match: 'data.case_id',
      },
    ],
  },
  { event: 'case/created' },
  async ({ event, step }) => {
    const { case_id, tenant_id } = event.data as { case_id: string; tenant_id: string };

    const [caseRow, tenant] = await step.run('fetch-case-and-tenant', async () => {
      const [{ data: c }, { data: t }] = await Promise.all([
        supabase.from('cases').select('*').eq('id', case_id).single(),
        supabase.from('tenants').select('*').eq('id', tenant_id).single(),
      ]);
      return [c, t];
    });

    if (!caseRow || !tenant) return { skipped: true };
    if (caseRow.status !== 'ACTIVE') return { skipped: true, reason: 'not active' };

    const ladder = tenant.policy_ladder?.stages ?? defaultStages();

    for (const stage of ladder) {
      if (!stage.enabled) continue;

      // Wait until the correct day relative to case creation
      const fireAt = new Date(caseRow.created_at);
      fireAt.setDate(fireAt.getDate() + stage.day_trigger);

      await step.sleepUntil(`wait-${stage.stage}`, fireAt);

      // Re-check case is still active before sending
      const { data: fresh } = await supabase
        .from('cases')
        .select('status, current_stage')
        .eq('id', case_id)
        .single();
      if (!fresh || fresh.status !== 'ACTIVE') break;

      await step.run(`send-${stage.stage}`, async () => {
        const template = await getTemplate(tenant_id, stage.stage, stage.template_id, caseRow.language);
        if (!template) return;

        const rendered = interpolateTemplate(template.body, buildVars(caseRow, tenant));

        const startMs = Date.now();
        let result;
        if (stage.channel === 'whatsapp') {
          const provider = await providerRouter.pickWhatsApp();
          result = await provider.sendFreeform(caseRow.parent_phone, rendered);
          await providerRouter.recordOutcome(provider.name, result.success, Date.now() - startMs);
        } else if (stage.channel === 'call') {
          const provider = await providerRouter.pickCalling();
          result = await provider.dial(
            caseRow.parent_phone,
            `${process.env.BASE_URL}/v1/webhooks/call-twiml`,
            `${process.env.BASE_URL}/v1/webhooks/call-events`
          );
          await providerRouter.recordOutcome(provider.name, true, Date.now() - startMs);
        } else {
          const provider = await providerRouter.pickSms();
          result = await provider.send(caseRow.parent_phone, rendered);
          await providerRouter.recordOutcome(provider.name, (result as { success: boolean }).success, Date.now() - startMs);
        }

        await supabase.from('timeline_events').insert({
          case_id,
          tenant_id,
          type: 'outbound_message',
          channel: stage.channel,
          direction: 'outbound',
          content: rendered,
          provider: stage.channel,
          message_id: (result as { callSid?: string; messageId?: string })?.messageId ?? (result as { callSid?: string })?.callSid ?? null,
        });

        await supabase
          .from('cases')
          .update({ current_stage: stage.stage, last_action_at: new Date().toISOString() })
          .eq('id', case_id);
      });
    }

    return { completed: true };
  }
);

async function getTemplate(tenantId: string, stage: string, templateId: string | undefined, language: string) {
  if (templateId) {
    const { data } = await supabase.from('templates').select('*').eq('id', templateId).single();
    return data;
  }
  const { data } = await supabase
    .from('templates')
    .select('*')
    .or(`tenant_id.eq.${tenantId},is_builtin.eq.true`)
    .eq('stage', stage)
    .eq('language', language)
    .eq('status', 'approved')
    .limit(1)
    .single();
  return data;
}

function buildVars(c: Record<string, unknown>, t: Record<string, unknown>): Record<string, string> {
  return {
    student_name: (c.student_name as string) ?? '',
    parent_name: (c.parent_name as string) ?? '',
    school_name: (t.school_name as string) ?? '',
    amount: String(c.fee_amount),
    currency: (c.currency as string) ?? 'INR',
    due_date: (c.due_date as string) ?? '',
    days_overdue: String(c.days_overdue),
    fee_type: (c.fee_type as string) ?? '',
    payment_link: (c.payment_link as string) ?? '',
  };
}

function defaultStages() {
  return [
    { stage: 'P1', day_trigger: 1, channel: 'whatsapp', enabled: true },
    { stage: 'P2', day_trigger: 5, channel: 'whatsapp', enabled: true },
    { stage: 'P3', day_trigger: 10, channel: 'call', enabled: true },
    { stage: 'P4', day_trigger: 15, channel: 'sms', enabled: true },
  ];
}
