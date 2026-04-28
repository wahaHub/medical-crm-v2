import type {
  InboundEmailEvent,
  InboundEmailStatus,
} from '../entities/inbound-email-event.entity.js';

export interface IInboundEmailEventRepository {
  claim(input: {
    provider: 'resend';
    providerEventId?: string | null;
    providerMessageId?: string | null;
  }): Promise<{ event: InboundEmailEvent; alreadyClaimed: boolean }>;
  complete(input: {
    id: string;
    status: InboundEmailStatus;
    createdMessageId?: string | null;
    error?: string | null;
  }): Promise<void>;
}
