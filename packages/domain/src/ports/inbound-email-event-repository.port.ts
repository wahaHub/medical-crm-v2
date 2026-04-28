import type {
  InboundEmailEvent,
  InboundEmailProvider,
  InboundEmailStatus,
} from '../entities/inbound-email-event.entity.js';
import type { Transaction } from './transaction-runner.port.js';

export type InboundEmailClaimInput = {
  provider: InboundEmailProvider;
} & (
  | {
      providerEventId: string;
      providerMessageId?: string | null;
    }
  | {
      providerEventId?: string | null;
      providerMessageId: string;
    }
);

export interface IInboundEmailEventRepository {
  claim(
    input: InboundEmailClaimInput,
    tx?: Transaction,
  ): Promise<{ event: InboundEmailEvent; alreadyClaimed: boolean }>;
  complete(input: {
    id: string;
    status: InboundEmailStatus;
    replyTokenId?: string | null;
    conversationId?: string | null;
    caseId?: string | null;
    fromEmail?: string | null;
    subject?: string | null;
    createdMessageId?: string | null;
    error?: string | null;
  }, tx?: Transaction): Promise<void>;
}
