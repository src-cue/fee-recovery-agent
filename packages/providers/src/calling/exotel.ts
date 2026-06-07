import type { CallingProvider } from '../types.js';
import type { CallSession, CallEvent } from '@fee-recovery/shared';

export class ExotelProvider implements CallingProvider {
  name = 'exotel';

  private get baseUrl() {
    return `https://${process.env.EXOTEL_API_KEY}:${process.env.EXOTEL_API_TOKEN}@api.exotel.com/v1/Accounts/${process.env.EXOTEL_SID}`;
  }

  async dial(to: string, _webhookUrl: string, callbackUrl: string): Promise<CallSession> {
    const res = await fetch(`${this.baseUrl}/Calls/connect.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: to,
        To: process.env.EXOTEL_CALLER_ID!,
        CallerId: process.env.EXOTEL_CALLER_ID!,
        StatusCallback: callbackUrl,
        StatusCallbackEvents: 'terminal',
        RecordingChannels: 'dual',
        PlayDtmf: '1',
      }),
    });
    const data = (await res.json()) as { Call: { Sid: string; Status: string } };
    return { callSid: data.Call.Sid, status: data.Call.Status, provider: this.name };
  }

  parseCallEvent(body: unknown): CallEvent {
    const b = body as Record<string, string>;
    return {
      callSid: b.CallSid,
      status: b.CallStatus,
      duration: parseInt(b.CallDuration ?? '0'),
      recordingUrl: b.RecordingUrl,
    };
  }
}
