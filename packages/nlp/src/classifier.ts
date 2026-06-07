import Groq from 'groq-sdk';
import OpenAI from 'openai';
import type { IntentResult } from '@fee-recovery/shared';

const SYSTEM_PROMPT = `You classify parent replies to fee reminder messages from schools.
Return ONLY valid JSON: { "intent": "paid|promise|dispute|distress|no_intent", "promise_date": "YYYY-MM-DD or null", "sentiment": 1-5, "language": "en|hi|ta|te|mr|kn|bn" }
Rules:
- paid: parent says they paid, payment done, sent money
- promise: parent gives a specific date, "will pay by X", "pay tomorrow"
- dispute: questions the amount, says fee is wrong, demands breakdown
- distress: expresses financial hardship, stress, fear, asks for help
- no_intent: anything else (ok, thanks, seen, etc.)
Sentiment: 1=very negative, 3=neutral, 5=very positive`;

let groqClient: Groq | null = null;
let openaiClient: OpenAI | null = null;

function getGroq(): Groq {
  if (!groqClient) groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groqClient;
}

function getOpenAI(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function classifyWithOpenAI(message: string): Promise<IntentResult> {
  const res = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  return JSON.parse(res.choices[0].message.content!) as IntentResult;
}

export async function classifyIntent(message: string): Promise<IntentResult> {
  try {
    const res = await getGroq().chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });
    return JSON.parse(res.choices[0].message.content!) as IntentResult;
  } catch {
    return classifyWithOpenAI(message);
  }
}
