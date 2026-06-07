import type { WhatsAppProvider } from '../types.js';
import type { SendResult, InboundMessage } from '@fee-recovery/shared';

interface Dialog360Webhook {
  messages: Array<{
    id: string;
    from: string;
    timestamp: string;
    text?: { body: string };
  }>;
}

export class Dialog360Provider implements WhatsAppProvider {
  name = '360dialog';
  private baseUrl = 'https://waba.360dialog.io/v1';

  async sendTemplate(to: string, templateName: string, params: string[]): Promise<SendResult> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'D360-API-KEY': process.env.DIALOG360_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to,
        type: 'template',
        template: {
          namespace: process.env.DIALOG360_CHANNEL_ID,
          name: templateName,
          language: { code: 'en', policy: 'deterministic' },
          components: [
            {
              type: 'body',
              parameters: params.map((p) => ({ type: 'text', text: p })),
            },
          ],
        },
      }),
    });
    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return { success: res.ok, messageId: data.messages?.[0]?.id ?? null, raw: data };
  }

  async sendFreeform(to: string, text: string): Promise<SendResult> {
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: { 'D360-API-KEY': process.env.DIALOG360_API_KEY!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, type: 'text', text: { body: text } }),
    });
    const data = (await res.json()) as { messages?: Array<{ id: string }> };
    return { success: res.ok, messageId: data.messages?.[0]?.id ?? null, raw: data };
  }

  parseInbound(body: unknown): InboundMessage {
    const b = body as Dialog360Webhook;
    const msg = b.messages[0];
    return {
      from: msg.from,
      text: msg.text?.body ?? '',
      messageId: msg.id,
      timestamp: new Date(parseInt(msg.timestamp) * 1000),
    };
  }
}
