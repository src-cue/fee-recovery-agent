import type { FastifyInstance } from 'fastify';
import { supabase } from '@fee-recovery/db';
import Groq from 'groq-sdk';

let groq: Groq | null = null;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

async function generateCallScript(caseRow: Record<string, unknown>, tenant: Record<string, unknown>): Promise<string> {
  const prompt = `Generate a natural, empathetic phone call script for a fee recovery agent.
School: ${tenant.school_name}
Parent name: ${caseRow.parent_name}
Student name: ${caseRow.student_name}
Amount overdue: ₹${caseRow.fee_amount} (${caseRow.currency})
Days overdue: ${caseRow.days_overdue}
Fee type: ${caseRow.fee_type}

Rules:
- Keep it under 60 words
- Be polite and empathetic, not aggressive
- Mention the school name, parent name, amount
- Ask them to press 1 if they've paid or will pay today, press 2 to speak with the fee office
- End with a thank you
- Plain text only, no special characters`;

  try {
    const res = await getGroq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 150,
    });
    return res.choices[0].message.content?.trim() ?? fallbackScript(caseRow, tenant);
  } catch {
    return fallbackScript(caseRow, tenant);
  }
}

function fallbackScript(c: Record<string, unknown>, t: Record<string, unknown>): string {
  return `Hello ${c.parent_name}, this is a reminder from ${t.school_name}. ` +
    `Your child ${c.student_name}'s ${c.fee_type} of rupees ${c.fee_amount} is overdue by ${c.days_overdue} days. ` +
    `Please press 1 if you have already paid or will pay today. Press 2 to speak with our fee office. Thank you.`;
}

export async function callTwimlRoutes(app: FastifyInstance) {
  // Twilio calls this to get what to say
  app.post('/call-twiml', async (req, reply) => {
    const { CallSid, To } = req.body as Record<string, string>;

    // Look up case by phone number or call SID
    const { data: timeline } = await supabase
      .from('timeline_events')
      .select('case_id, tenant_id')
      .eq('message_id', CallSid)
      .single();

    let caseRow: Record<string, unknown> | null = null;
    let tenant: Record<string, unknown> | null = null;

    if (timeline) {
      const [{ data: c }, { data: t }] = await Promise.all([
        supabase.from('cases').select('*').eq('id', timeline.case_id).single(),
        supabase.from('tenants').select('*').eq('id', timeline.tenant_id).single(),
      ]);
      caseRow = c;
      tenant = t;
    } else if (To) {
      // Fallback: find active case by destination phone
      const { data: c } = await supabase
        .from('cases')
        .select('*, tenants(*)')
        .eq('parent_phone', To)
        .eq('status', 'ACTIVE')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (c) {
        const { tenants: t, ...rest } = c as Record<string, unknown> & { tenants: unknown };
        caseRow = rest;
        tenant = t as Record<string, unknown>;
      }
    }

    // Build TwiML response
    let script = 'Hello, this is an automated fee reminder from your school. Please contact the fee office. Thank you.';
    if (caseRow && tenant) {
      script = await generateCallScript(caseRow, tenant);
    }

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="en-IN">${escapeXml(script)}</Say>
  <Gather numDigits="1" action="${process.env.BASE_URL}/v1/webhooks/call-input" timeout="5">
    <Say voice="Polly.Aditi" language="en-IN">Press 1 if you have paid or will pay today. Press 2 to speak with someone.</Say>
  </Gather>
  <Say voice="Polly.Aditi" language="en-IN">We did not receive your input. Our team will follow up. Goodbye.</Say>
</Response>`;

    return reply.header('Content-Type', 'text/xml').send(twiml);
  });

  // Handle keypress response after TwiML prompt
  app.post('/call-input', async (req, reply) => {
    const { Digits, CallSid } = req.body as Record<string, string>;

    const { data: timeline } = await supabase
      .from('timeline_events')
      .select('case_id, tenant_id')
      .eq('message_id', CallSid)
      .single();

    if (timeline && Digits === '1') {
      await supabase.from('timeline_events').insert({
        case_id: timeline.case_id,
        tenant_id: timeline.tenant_id,
        type: 'note',
        content: 'Parent pressed 1 on call — confirmed payment or intent to pay today',
      });
    }

    const twiml = Digits === '1'
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Aditi" language="en-IN">Thank you for confirming. We have noted your response. Have a good day.</Say></Response>`
      : `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Aditi" language="en-IN">Please hold while we connect you to our fee office.</Say><Dial>${process.env.SCHOOL_OFFICE_NUMBER ?? ''}</Dial></Response>`;

    return reply.header('Content-Type', 'text/xml').send(twiml);
  });
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
