import twilio from 'twilio';
import type { WhatsAppProvider } from '../types.js';
import type { SendResult, InboundMessage } from '@fee-recovery/shared';

export class TwilioWAProvider implements WhatsAppProvider {
  name = 'twilio-wa';
  private get client() {
    return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  async sendTemplate(to: string, templateName: string, params: string[]): Promise<SendResult> {
    const msg = await this.client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WA_NUMBER}`,
      to: `whatsapp:${to}`,
      contentSid: templateName,
      contentVariables: JSON.stringify(
        params.reduce<Record<string, string>>((acc, p, i) => ({ ...acc, [i + 1]: p }), {})
      ),
    });
    return { success: true, messageId: msg.sid, raw: msg };
  }

  async sendFreeform(to: string, text: string): Promise<SendResult> {
    const msg = await this.client.messages.create({
      from: `whatsapp:${process.env.TWILIO_WA_NUMBER}`,
      to: `whatsapp:${to}`,
      body: text,
    });
    return { success: true, messageId: msg.sid, raw: msg };
  }

  parseInbound(body: unknown): InboundMessage {
    const b = body as Record<string, string>;
    return {
      from: b.From.replace('whatsapp:', ''),
      text: b.Body,
      messageId: b.MessageSid,
      timestamp: new Date(),
    };
  }
}
