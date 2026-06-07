import type { SmsProvider } from '../types.js';
import type { SendResult } from '@fee-recovery/shared';

export class Msg91Provider implements SmsProvider {
  name = 'msg91';

  async isDndNumber(phone: string): Promise<boolean> {
    try {
      const res = await fetch(
        `https://api.msg91.com/api/dnd/is-dnd?authkey=${process.env.MSG91_AUTH_KEY}&number=${phone}`
      );
      const data = (await res.json()) as { type: string };
      return data.type === 'dnd';
    } catch {
      return false;
    }
  }

  async send(to: string, text: string): Promise<SendResult> {
    const isDnd = await this.isDndNumber(to);
    if (isDnd) {
      return { success: false, messageId: null, raw: { error: 'DND number' } };
    }
    const res = await fetch('https://api.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: process.env.MSG91_AUTH_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: process.env.MSG91_SENDER_ID,
        mobiles: to,
        message: text,
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    return { success: res.ok, messageId: (data.request_id as string) ?? null, raw: data };
  }
}
