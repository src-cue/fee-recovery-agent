import { Redis } from '@upstash/redis';
import { supabase } from '@fee-recovery/db';
import { GupshupProvider } from './whatsapp/gupshup.js';
import { Dialog360Provider } from './whatsapp/dialog360.js';
import { TwilioWAProvider } from './whatsapp/twilio-wa.js';
import { ExotelProvider } from './calling/exotel.js';
import { TwilioCallingProvider } from './calling/twilio.js';
import { PlivoProvider } from './calling/plivo.js';
import { Msg91Provider } from './sms/msg91.js';
import { TwilioSmsProvider } from './sms/twilio-sms.js';
import type { WhatsAppProvider, CallingProvider, SmsProvider } from './types.js';

const WA_PROVIDERS: WhatsAppProvider[] = [
  new GupshupProvider(),
  new Dialog360Provider(),
  new TwilioWAProvider(),
];

const CALLING_PROVIDERS: CallingProvider[] = [
  new ExotelProvider(),
  new TwilioCallingProvider(),
  new PlivoProvider(),
];

const SMS_PROVIDERS: SmsProvider[] = [new Msg91Provider(), new TwilioSmsProvider()];

let redis: Redis | null = null;
function getRedis(): Redis {
  if (!redis)
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_URL!,
      token: process.env.UPSTASH_REDIS_TOKEN!,
    });
  return redis;
}

async function getHealth(provider: string): Promise<{ isHealthy: boolean }> {
  const { data } = await supabase
    .from('provider_health')
    .select('is_healthy')
    .eq('provider', provider)
    .single();
  return { isHealthy: data?.is_healthy ?? true };
}

export class ProviderRouter {
  async pickWhatsApp(exclude?: string): Promise<WhatsAppProvider> {
    for (const p of WA_PROVIDERS.filter((p) => p.name !== exclude)) {
      const h = await getHealth(p.name);
      if (h.isHealthy) return p;
    }
    return WA_PROVIDERS[0];
  }

  async pickCalling(exclude?: string): Promise<CallingProvider> {
    for (const p of CALLING_PROVIDERS.filter((p) => p.name !== exclude)) {
      const h = await getHealth(p.name);
      if (h.isHealthy) return p;
    }
    return CALLING_PROVIDERS[0];
  }

  async pickSms(exclude?: string): Promise<SmsProvider> {
    for (const p of SMS_PROVIDERS.filter((p) => p.name !== exclude)) {
      const h = await getHealth(p.name);
      if (h.isHealthy) return p;
    }
    return SMS_PROVIDERS[0];
  }

  async recordOutcome(provider: string, success: boolean, latencyMs: number): Promise<void> {
    const r = getRedis();
    const key = `provider:outcomes:${provider}`;
    await r.lpush(key, JSON.stringify({ success, latencyMs, ts: Date.now() }));
    await r.ltrim(key, 0, 99);

    const raw = await r.lrange(key, 0, 99);
    const outcomes = raw.map((o) => JSON.parse(o as string) as { success: boolean; latencyMs: number });
    const errorRate = outcomes.filter((o) => !o.success).length / outcomes.length;
    const avgLatency = Math.round(outcomes.reduce((s, o) => s + o.latencyMs, 0) / outcomes.length);

    await supabase.from('provider_health').upsert({
      provider,
      is_healthy: errorRate < 0.05,
      error_rate: errorRate,
      avg_latency: avgLatency,
      last_check: new Date().toISOString(),
    });
  }
}

export const providerRouter = new ProviderRouter();
