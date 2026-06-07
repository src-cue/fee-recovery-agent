import Groq from 'groq-sdk';
import { supabase } from '@fee-recovery/db';

const PRIORITY_PROMPT = `You are a fee recovery prioritization engine for schools.
Given a list of overdue fee cases, score each case from 1-100 for call priority.
Higher score = call first.

Scoring rules:
- Days overdue: 1pt per day (max 40pts)
- Amount due: 1pt per ₹1000 (max 30pts)
- No contact made yet: +15pts
- Has promise to pay (follow up needed): +10pts
- Previously paid then lapsed: +10pts
- Distress flagged: -20pts (don't push hard cases)
- Already resolved/paid: 0

Return ONLY valid JSON array: [{"case_id": "...", "score": 0-100, "reason": "one line"}]`;

let groq: Groq | null = null;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

export async function scoreCasePriority(cases: Array<{
  id: string;
  days_overdue: number;
  fee_amount: number;
  call_attempts: number;
  status: string;
  last_call_at: string | null;
}>): Promise<Array<{ case_id: string; score: number; reason: string }>> {
  if (!cases.length) return [];

  const input = cases.map(c => ({
    case_id: c.id,
    days_overdue: c.days_overdue,
    amount_inr: c.fee_amount,
    call_attempts: c.call_attempts ?? 0,
    last_called: c.last_call_at ?? 'never',
    status: c.status,
  }));

  try {
    const res = await getGroq().chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: PRIORITY_PROMPT },
        { role: 'user', content: JSON.stringify(input) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const parsed = JSON.parse(res.choices[0].message.content!);
    // Handle both {scores: [...]} and direct array
    const scores = Array.isArray(parsed) ? parsed : (parsed.scores ?? parsed.cases ?? []);
    return scores;
  } catch {
    // Fallback: simple formula scoring
    return cases.map(c => ({
      case_id: c.id,
      score: Math.min(100, (c.days_overdue * 1) + (c.fee_amount / 1000) + (c.call_attempts === 0 ? 15 : 0)),
      reason: `${c.days_overdue} days overdue, ₹${c.fee_amount} due`,
    }));
  }
}

export async function refreshPriorityScores(tenantId: string) {
  const { data: cases } = await supabase
    .from('cases')
    .select('id, days_overdue, fee_amount, call_attempts, status, last_call_at')
    .eq('tenant_id', tenantId)
    .eq('status', 'ACTIVE');

  if (!cases?.length) return;

  // Score in batches of 20 to stay within token limits
  const BATCH = 20;
  for (let i = 0; i < cases.length; i += BATCH) {
    const batch = cases.slice(i, i + BATCH);
    const scores = await scoreCasePriority(batch);
    for (const s of scores) {
      await supabase
        .from('cases')
        .update({ priority_score: s.score, priority_reason: s.reason })
        .eq('id', s.case_id);
    }
  }
}
