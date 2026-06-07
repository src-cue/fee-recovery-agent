import type { SendResult, InboundMessage, CallSession, CallEvent } from '@fee-recovery/shared';

export interface WhatsAppProvider {
  name: string;
  sendTemplate(to: string, templateName: string, params: string[]): Promise<SendResult>;
  sendFreeform(to: string, text: string): Promise<SendResult>;
  parseInbound(body: unknown): InboundMessage;
}

export interface CallingProvider {
  name: string;
  dial(to: string, webhookUrl: string, callbackUrl: string): Promise<CallSession>;
  parseCallEvent(body: unknown): CallEvent;
}

export interface SmsProvider {
  name: string;
  send(to: string, text: string): Promise<SendResult>;
}

export type { SendResult, InboundMessage, CallSession, CallEvent };
