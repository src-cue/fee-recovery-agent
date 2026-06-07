import { Inngest } from 'inngest';

export const inngest = new Inngest({
  id: 'fee-recovery-agent',
  eventKey: process.env.INNGEST_EVENT_KEY,
});
