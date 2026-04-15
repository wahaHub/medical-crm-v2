import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ChatbotV3Card } from '@medical-crm/validation';
import { describe, expect, it, vi } from 'vitest';
import { ChatbotV3Cards } from './chatbot-v3-cards';

const processGuideCard: ChatbotV3Card = {
  cardId: 'card-process-1',
  cardType: 'PROCESS_GUIDE',
  payload: {
    guideId: 'guide-process',
    title: 'Medical travel process',
  },
  actions: [{
    actionType: 'OPEN_MODAL',
    label: 'View process',
    params: {
      modalKey: 'MEDICAL_TRAVEL_PROCESS',
    },
  }],
};

const uploadRecordsCard: ChatbotV3Card = {
  cardId: 'card-upload-1',
  cardType: 'UPLOAD_RECORDS',
  payload: {
    required: true,
    uploadedCount: 2,
  },
  actions: [{
    actionType: 'SUBMIT',
    label: 'Upload records',
    params: {
      actionKey: 'UPLOAD_RECORDS',
    },
  }],
};

const recommendationCard: ChatbotV3Card = {
  cardId: 'card-recommendation-1',
  cardType: 'RECOMMENDATION_LIST',
  payload: {
    candidates: [{
      hospitalId: 'hospital-1',
      name: 'Saint Mary Hospital',
      reason: 'Strong hepatobiliary team',
    }],
  },
  actions: [{
    actionType: 'SUBMIT',
    label: 'Select',
    params: {
      hospitalId: 'hospital-1',
    },
  }],
};

const consultBookingCard: ChatbotV3Card = {
  cardId: 'card-consult-1',
  cardType: 'CONSULT_BOOKING',
  payload: {
    status: 'scheduled',
  },
  actions: [{
    actionType: 'REFRESH_STATUS',
    label: 'Refresh booking',
    params: {
      actionKey: 'CONSULT_BOOKING',
    },
  }],
};

const handoffStatusCard: ChatbotV3Card = {
  cardId: 'card-handoff-1',
  cardType: 'HANDOFF_STATUS',
  payload: {
    required: true,
    ticketId: 'ticket-123',
  },
  actions: [{
    actionType: 'OPEN_URL',
    label: 'Open handoff portal',
    params: {
      actionKey: 'HANDOFF_PORTAL',
    },
  }],
};

describe('ChatbotV3Cards', () => {
  it('renders recommendation cards and dispatches submit action', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();

    render(<ChatbotV3Cards cards={[recommendationCard]} onAction={onAction} />);

    await user.click(screen.getByRole('button', { name: /select/i }));

    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'card-recommendation-1',
      cardType: 'RECOMMENDATION_LIST',
      actionType: 'SUBMIT',
      params: {
        hospitalId: 'hospital-1',
      },
    }));
  });

  it('renders the supported card types with their key details', () => {
    render(
      <ChatbotV3Cards
        cards={[processGuideCard, uploadRecordsCard, consultBookingCard, handoffStatusCard]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Medical travel process' })).toBeTruthy();
    expect(screen.getByText('2 files uploaded')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Ticket #ticket-123')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View process' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload records' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh booking' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open handoff portal' })).toBeTruthy();
  });
});
