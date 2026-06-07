import twilio from 'twilio';
import type { SmsProvider } from '../types.js';
import type { SendResult } from '@fee-recovery/shared';

export class TwilioSmsProvider implements SmsProvider {
  name = 'twilio-sms';
  private get client() {
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  async send(to: string, text: string): Promise<SendResult> {
    const msg = await this.client.messages.create({
      from: process.env.TWILIO_NUMBER!,
      to,
      body: text,
    });
    return { success: true, messageId: msg.sid, raw: msg };
  }
}
