import { inngest } from '../lib/inngest.js';
import { supabase } from '@fee-recovery/db';
import { classifyIntent } from '@fee-recovery/nlp';

export const callCompletedFn = inngest.createFunction(
  { id: 'call-completed', retries: 2 },
  { event: 'call/completed' },
  async ({ event, step }) => {
    const { case_id, tenant_id, status, duration, recording_url } = event.data as {
      case_id: string;
      tenant_id: string;
      status: string;
      duration: number;
      recording_url?: string;
    };

    // Increment call attempt counter
    await step.run('increment-call-attempts', async () => {
      await supabase.rpc('increment_call_attempts', { p_case_id: case_id });
      await supabase
        .from('cases')
        .update({ last_call_at: new Date().toISOString(), last_action_at: new Date().toISOString() })
        .eq('id', case_id);
    });

    // Not reachable — short call or no-answer
    if (status === 'no-answer' || status === 'busy' || status === 'failed' || duration < 5) {
      await step.run('mark-not-reachable', async () => {
        await supabase.from('timeline_events').insert({
          case_id,
          tenant_id,
          type: 'call',
          channel: 'call',
          direction: 'outbound',
          content: `Call not connected — status: ${status}`,
          metadata: { status, duration },
        });
      });
      return { outcome: 'not_reachable' };
    }

    // Transcribe recording via Groq Whisper if recording available
    let transcript: string | null = null;
    if (recording_url) {
      transcript = await step.run('transcribe-recording', async () => {
        try {
          const Groq = (await import('groq-sdk')).default;
          const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
          const audioRes = await fetch(recording_url);
          const audioBlob = await audioRes.blob();
          // Groq Whisper transcription
          const transcription = await groq.audio.transcriptions.create({
            file: new File([audioBlob], 'recording.mp3', { type: 'audio/mpeg' }),
            model: 'whisper-large-v3',
          });
          return transcription.text;
        } catch {
          return null;
        }
      });
    }

    // Classify intent from transcript
    const intent = transcript
      ? await step.run('classify-call-intent', async () => {
          const result = await classifyIntent(transcript!);
          return result;
        })
      : null;

    // Update case status based on intent
    await step.run('update-case-from-call', async () => {
      const content = transcript
        ? `Call completed (${duration}s). Transcript: ${transcript.slice(0, 300)}${transcript.length > 300 ? '...' : ''}`
        : `Call completed (${duration}s). No transcript available.`;

      await supabase.from('timeline_events').insert({
        case_id,
        tenant_id,
        type: 'call',
        channel: 'call',
        direction: 'outbound',
        content,
        intent: intent?.intent ?? null,
        sentiment: intent?.sentiment ?? null,
        metadata: { status, duration, recording_url, transcript },
      });

      if (intent?.intent === 'paid') {
        await supabase
          .from('cases')
          .update({ status: 'RESOLVED', last_action_at: new Date().toISOString() })
          .eq('id', case_id);
        await supabase.from('timeline_events').insert({
          case_id, tenant_id, type: 'status_change',
          content: 'Auto-resolved: confirmed payment on call',
        });
      } else if (intent?.intent === 'promise' && intent.promise_date) {
        await supabase.from('timeline_events').insert({
          case_id, tenant_id, type: 'note',
          content: `Promise to pay by ${intent.promise_date} (confirmed on call)`,
          metadata: { promise_date: intent.promise_date },
        });
      } else if (intent?.intent === 'distress') {
        await supabase
          .from('cases')
          .update({ status: 'ESCALATED', last_action_at: new Date().toISOString() })
          .eq('id', case_id);
      }
    });

    return { outcome: intent?.intent ?? 'completed', transcript: !!transcript };
  }
);
