// @vitest-environment jsdom

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useTransition: () => [false, (callback: () => void | Promise<void>) => void callback()],
    useState: <T,>(initial: T | (() => T)) => [
      typeof initial === 'function' ? (initial as () => T)() : initial,
      vi.fn(),
    ] as const,
    useEffect: vi.fn(),
    useRef: <T,>(initial: T) => ({ current: initial }),
    useMemo: <T,>(factory: () => T) => factory(),
    useCallback: <T extends (...args: never[]) => unknown>(callback: T) => callback,
  };
});

const {
  mockApiFetch,
  mockRevalidatePath,
  mockInvalidateQueries,
  mockRefetch,
  mockUseMessages,
  mockUseQueryClient,
  mockUseConversations,
} = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockRefetch: vi.fn(),
  mockUseMessages: vi.fn(),
  mockUseQueryClient: vi.fn(),
  mockUseConversations: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mockUseQueryClient,
}));

vi.mock('@medical-crm/ui', () => ({
  AsyncStatusCard: ({ title }: { title: string }) => <div>{title}</div>,
  ChatLayout: ({
    header,
  }: {
    header?: { action?: React.ReactNode };
  }) => (
    <div>
      <div>Chat Layout</div>
      <div data-testid="chat-layout-header-action">{header?.action}</div>
    </div>
  ),
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  MessageConversationSidebar: () => <div>Sidebar</div>,
  MessageCaseDetailPanel: () => <div>Case Panel</div>,
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PdfPreview: () => <div>PDF Preview</div>,
  useMediaUpload: () => ({
    upload: vi.fn(),
    isUploading: false,
  }),
}));

vi.mock('lucide-react', () => {
  const Icon = () => <svg aria-hidden="true" />;
  return {
    MessageSquare: Icon,
    Check: Icon,
    X: Icon,
    Search: Icon,
    FolderOpen: Icon,
    Building2: Icon,
    User: Icon,
  };
});

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({
    user: {},
  }),
}));

vi.mock('@/queries/use-conversations', () => ({
  useConversations: mockUseConversations,
  useMessages: mockUseMessages,
}));

vi.mock('@/queries/use-hospitals', () => ({
  useHospitals: vi.fn(),
  useHospitalCases: vi.fn(),
}));

vi.mock('@/queries/use-cases', () => ({
  useCase: vi.fn(),
  useCaseDocuments: vi.fn(),
  useCases: vi.fn(),
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

import { restoreConversationAi } from '../actions/message-actions';
import * as messageActions from '../actions/message-actions';
import { ChatPanel, ConversationAssistantControlSurface } from '../components/messages-center';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConversationAssistantControlSurface', () => {
  beforeEach(() => {
    globalThis.React = React;
    vi.clearAllMocks();
    mockUseQueryClient.mockReturnValue({
      invalidateQueries: mockInvalidateQueries,
    });
    mockUseMessages.mockReturnValue({
      data: [],
      refetch: mockRefetch,
    });
    mockUseConversations.mockReturnValue({
      data: [],
      isLoading: false,
    });
  });

  it('renders the AI-active status for admin-patient conversations', () => {
    const markup = renderToStaticMarkup(
      <ConversationAssistantControlSurface
        conversation={{
          id: 'conv-ai',
          category: 'ADMIN_PATIENT',
          assistantMode: 'AI_ACTIVE',
        }}
      />,
    );

    expect(markup).toContain('Medora AI 当前在线');
    expect(markup).not.toContain('恢复 Medora AI');
  });

  it('renders the human-takeover status and restore action for admin-patient conversations', () => {
    const markup = renderToStaticMarkup(
      <ConversationAssistantControlSurface
        conversation={{
          id: 'conv-human',
          category: 'ADMIN_PATIENT',
          assistantMode: 'HUMAN_TAKEOVER',
        }}
        errorMessage="恢复失败，请稍后重试"
      />,
    );

    expect(markup).toContain('人工接管中');
    expect(markup).not.toContain('恢复 Medora AI');
    expect(markup).toContain('恢复失败，请稍后重试');
    expect(markup).toContain('role="alert"');
  });

  it('does not render for non-admin-patient conversations', () => {
    const markup = renderToStaticMarkup(
      <ConversationAssistantControlSurface
        conversation={{
          id: 'conv-hospital',
          category: 'ADMIN_HOSPITAL',
          assistantMode: 'HUMAN_TAKEOVER',
        }}
      />,
    );

    expect(markup).toBe('');
  });

  it('renders the restore action in the chat header for human-takeover admin-patient conversations', () => {
    const markup = renderToStaticMarkup(
      <ChatPanel
        conversation={{
          id: 'conv-human',
          category: 'ADMIN_PATIENT',
          assistantMode: 'HUMAN_TAKEOVER',
          participantName: 'Patient One',
        }}
        showInfoPanel={false}
      />,
    );

    expect(markup).toContain('人工接管中');
    expect(markup).toContain('恢复 Medora AI');
  });

  it('clicks the header CTA and refreshes conversation and message data after restore', async () => {
    const restoreSpy = vi.spyOn(messageActions, 'restoreConversationAi').mockResolvedValue({
      id: 'conv-human',
      assistantMode: 'AI_ACTIVE',
    });

    render(
      <ChatPanel
        conversation={{
          id: 'conv-human',
          category: 'ADMIN_PATIENT',
          assistantMode: 'HUMAN_TAKEOVER',
          participantName: 'Patient One',
        }}
        showInfoPanel={false}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '恢复 Medora AI' }));

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith('conv-human');
      expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations'] });
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

});

describe('restoreConversationAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores AI through the conversation update endpoint and revalidates admin pages', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ id: 'conv-1', assistantMode: 'AI_ACTIVE' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await restoreConversationAi('conv-1');

    expect(mockApiFetch).toHaveBeenCalledWith('/api/v2/conversations/conv-1', {
      method: 'PUT',
      body: JSON.stringify({ assistantMode: 'AI_ACTIVE' }),
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/messages');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/cases');
    expect(result).toEqual({ id: 'conv-1', assistantMode: 'AI_ACTIVE' });
  });

  it('surfaces upstream restore errors', async () => {
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ message: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(restoreConversationAi('missing-conv')).rejects.toThrow('Conversation not found');
  });
});
