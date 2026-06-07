import twilio from 'twilio';
import type { CallingProvider } from '../types.js';
import type { CallSession, CallEvent } from '@fee-recovery/shared';

export class TwilioCallingProvider implements CallingProvider {
  name = 'twilio';
  private get client() {
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  async dial(to: string, webhookUrl: string, callbackUrl: string): Promise<CallSession> {
    const call = await this.client.calls.create({
      to,
      from: process.env.TWILIO_NUMBER!,
      url: webhookUrl,
      statusCallback: callbackUrl,
      statusCallbackEvent: ['completed'],
      record: true,
      recordingStatusCallback: `${process.env.BASE_URL}/v1/webhooks/call-recording`,
    });
    return { callSid: call.sid, status: call.status, provider: this.name };
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
