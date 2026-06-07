import plivo from 'plivo';
import type { CallingProvider } from '../types.js';
import type { CallSession, CallEvent } from '@fee-recovery/shared';

export class PlivoProvider implements CallingProvider {
  name = 'plivo';
  private get client() {
    return new plivo.Client(process.env.PLIVO_AUTH_ID!, process.env.PLIVO_AUTH_TOKEN!);
  }

  async dial(to: string, webhookUrl: string, callbackUrl: string): Promise<CallSession> {
    const res = await this.client.calls.create(process.env.PLIVO_NUMBER!, to, webhookUrl, {
      callbackUrl,
      record: true,
      recordingCallbackUrl: `${process.env.BASE_URL}/v1/webhooks/call-recording`,
    });
    return { callSid: res.requestUuid, status: 'initiated', provider: this.name };
  }

  parseCallEvent(body: unknown): CallEvent {
    const b = body as Record<string, string>;
    return {
      callSid: b.CallUUID,
      status: b.Event === 'hangup' ? 'completed' : b.Event,
      duration: parseInt(b.Duration ?? '0'),
      recordingUrl: b.RecordUrl,
    };
  }
}
