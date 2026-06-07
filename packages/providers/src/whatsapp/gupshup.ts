import type { WhatsAppProvider } from '../types.js';
import type { SendResult, InboundMessage } from '@fee-recovery/shared';

interface GupshupWebhook {
  timestamp: number;
  payload: {
    id: string;
    sender: { phone: string };
    payload: { text: string };
  };
}

export class GupshupProvider implements WhatsAppProvider {
  name = 'gupshup';

  async sendTemplate(to: string, templateName: string, params: string[]): Promise<SendResult> {
    const res = await fetch('https://api.gupshup.io/sm/api/v1/template/msg', {
      method: 'POST',
      headers: {
        apikey: process.env.GUPSHUP_API_KEY!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.GUPSHUP_APP_NAME!,
        destination: to,
        'src.name': process.env.GUPSHUP_APP_NAME!,
        template: JSON.stringify({ id: templateName, params }),
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return { success: res.ok, messageId: (data.messageId as string) ?? null, raw: data };
  }

  async sendFreeform(to: string, text: string): Promise<SendResult> {
    const res = await fetch('https://api.gupshup.io/sm/api/v1/msg', {
      method: 'POST',
      headers: {
        apikey: process.env.GUPSHUP_API_KEY!,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        channel: 'whatsapp',
        source: process.env.GUPSHUP_APP_NAME!,
        destination: to,
        message: JSON.stringify({ type: 'text', text }),
        'src.name': process.env.GUPSHUP_APP_NAME!,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return { success: res.ok, messageId: (data.messageId as string) ?? null, raw: data };
  }

  parseInbound(body: unknown): InboundMessage {
    const b = body as GupshupWebhook;
    return {
      from: b.payload.sender.phone,
      text: b.payload.payload.text,
      messageId: b.payload.id,
      timestamp: new Date(b.timestamp),
    };
  }
}
