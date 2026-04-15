'use client';

import type { ChatbotV3Card } from '@medical-crm/validation';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Card, CardTitle } from './card';

export type ChatbotV3CardsActionContext = {
  cardId: string;
  cardType: ChatbotV3Card['cardType'];
} & ChatbotV3Card['actions'][number];

export interface ChatbotV3CardsProps {
  cards: ChatbotV3Card[];
  onAction?: (action: ChatbotV3CardsActionContext) => void;
  className?: string;
}

export function ChatbotV3Cards({
  cards,
  onAction,
  className,
}: ChatbotV3CardsProps) {
  if (cards.length === 0) {
    return null;
  }

  return (
    <section className={cn('space-y-3', className)} aria-label="Chatbot cards">
      {cards.map((card) => (
        <Card key={card.cardId} className="space-y-4 border border-slate-200 p-4 shadow-none">
          <article className="space-y-4">
            <header className="space-y-1">
              <CardTitle className="mb-0 text-base">{getCardTitle(card)}</CardTitle>
              {renderCardContent(card)}
            </header>
            {card.actions.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {card.actions.map((action, index) => (
                  <Button
                    key={`${card.cardId}-${action.label}-${index}`}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onAction?.({
                        cardId: card.cardId,
                        cardType: card.cardType,
                        ...action,
                      });
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}
          </article>
        </Card>
      ))}
    </section>
  );
}

function getCardTitle(card: ChatbotV3Card): string {
  switch (card.cardType) {
    case 'PROCESS_GUIDE':
      return card.payload.title;
    case 'UPLOAD_RECORDS':
      return 'Upload medical records';
    case 'RECOMMENDATION_LIST':
      return 'Recommended hospitals';
    case 'CONSULT_BOOKING':
      return 'Consult booking';
    case 'HANDOFF_STATUS':
      return 'Support handoff';
  }
}

function renderCardContent(card: ChatbotV3Card) {
  switch (card.cardType) {
    case 'PROCESS_GUIDE':
      return (
        <p className="text-sm text-slate-600">
          Guide ID: {card.payload.guideId}
        </p>
      );
    case 'UPLOAD_RECORDS':
      return (
        <div className="space-y-1 text-sm text-slate-600">
          <p>{card.payload.uploadedCount} files uploaded</p>
          <p>{card.payload.required ? 'Required to continue' : 'Optional step'}</p>
        </div>
      );
    case 'RECOMMENDATION_LIST':
      return (
        <ul className="space-y-2 text-sm text-slate-600">
          {card.payload.candidates.map((candidate) => (
            <li key={candidate.hospitalId}>
              <p className="font-medium text-slate-900">{candidate.name}</p>
              {candidate.reason ? <p>{candidate.reason}</p> : null}
            </li>
          ))}
        </ul>
      );
    case 'CONSULT_BOOKING':
      return (
        <p className="text-sm text-slate-600">
          {formatConsultStatus(card.payload.status)}
        </p>
      );
    case 'HANDOFF_STATUS':
      return (
        <div className="space-y-1 text-sm text-slate-600">
          <p>{card.payload.required ? 'Handoff requested' : 'No handoff required'}</p>
          {card.payload.ticketId ? <p>Ticket #{card.payload.ticketId}</p> : null}
        </div>
      );
  }
}

function formatConsultStatus(status: 'idle' | 'scheduled' | 'failed') {
  switch (status) {
    case 'idle':
      return 'Ready to book';
    case 'scheduled':
      return 'Scheduled';
    case 'failed':
      return 'Booking needs attention';
  }
}
