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
  mockUseHospitals,
  mockUseHospitalCases,
  mockUseCase,
  mockUseCaseDocuments,
  mockUseCases,
} = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockRefetch: vi.fn(),
  mockUseMessages: vi.fn(),
  mockUseQueryClient: vi.fn(),
  mockUseConversations: vi.fn(),
  mockUseHospitals: vi.fn(),
  mockUseHospitalCases: vi.fn(),
  mockUseCase: vi.fn(),
  mockUseCaseDocuments: vi.fn(),
  mockUseCases: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: mockUseQueryClient,
}));

vi.mock('@medical-crm/ui', () => ({
  AsyncStatusCard: ({ title }: { title: string }) => <div>{title}</div>,
  ChatLayout: ({
    header,
    messages,
    onOpenAttachment,
  }: {
    header?: { action?: React.ReactNode };
    messages?: Array<{ attachments?: Array<{ name?: string; storageKey?: string; url?: string; type?: string }> }>;
    onOpenAttachment?: (attachment: { name?: string; storageKey?: string; url?: string; type?: string }) => void;
  }) => (
    <div>
      <div>Chat Layout</div>
      <div data-testid="chat-layout-header-action">{header?.action}</div>
      {messages?.flatMap((message) => message.attachments ?? []).map((attachment, index) => (
        <button
          key={`${attachment.storageKey ?? attachment.url ?? index}`}
          type="button"
          onClick={() => onOpenAttachment?.(attachment)}
        >
          Open {attachment.name ?? 'attachment'}
        </button>
      ))}
    </div>
  ),
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  MessageConversationSidebar: ({
    sections,
  }: {
    sections?: Array<{ key: string; items: Array<{ id: string; title: string }> }>;
  }) => (
    <div>
      <div>Sidebar</div>
      {sections?.flatMap((section) => section.items).map((item) => (
        <div key={item.id}>{item.title}</div>
      ))}
    </div>
  ),
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
  useHospitals: mockUseHospitals,
  useHospitalCases: mockUseHospitalCases,
}));

vi.mock('@/queries/use-cases', () => ({
  useCase: mockUseCase,
  useCaseDocuments: mockUseCaseDocuments,
  useCases: mockUseCases,
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

import { restoreConversationAi } from '../actions/message-actions';
import * as messageActions from '../actions/message-actions';
import { buildPdfPreviewUrl, ChatPanel, ConversationAssistantControlSurface, MessagesCenter } from '../components/messages-center';

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
    mockUseHospitals.mockReturnValue({ data: { data: [] } });
    mockUseHospitalCases.mockReturnValue({ data: { data: [] } });
    mockUseCase.mockReturnValue({ data: null });
    mockUseCaseDocuments.mockReturnValue({ data: [] });
    mockUseCases.mockReturnValue({ data: { data: [] } });
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
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['conversations'] });
    expect(mockRefetch).toHaveBeenCalled();
  });
});

describe('MessagesCenter', () => {
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
    mockUseHospitals.mockReturnValue({ data: { data: [] } });
    mockUseHospitalCases.mockReturnValue({ data: { data: [] } });
    mockUseCase.mockReturnValue({ data: null });
    mockUseCaseDocuments.mockReturnValue({ data: [] });
    mockUseCases.mockReturnValue({ data: { data: [] } });
  });

  it('shows hospital-patient conversations when the case tab restricts included categories', () => {
    mockUseConversations.mockReturnValue({
      data: {
        data: [
          {
            id: 'conv-hospital',
            category: 'HOSPITAL_PATIENT',
            title: 'Hospital Thread',
            participantName: 'Hospital Thread',
          },
        ],
      },
      isLoading: false,
    });

    render(
      <MessagesCenter
        caseId="case-1"
        showSearch={false}
        showCategoryFilter={false}
        showInfoPanel={false}
        allowCreateConversation={false}
        groupByCategorySections={false}
        includedCategories={['HOSPITAL_PATIENT']}
        readOnly
      />,
    );

    expect(screen.getByText('Hospital Thread')).toBeTruthy();
  });
});

describe('message attachment PDF previews', () => {
  it('uses the signed attachment URL directly instead of the disabled legacy preview route', () => {
    const signedUrl = 'https://signed.example.com/attachments/report.pdf?token=abc';

    expect(buildPdfPreviewUrl(signedUrl, 'report.pdf')).toBe(signedUrl);
    expect(buildPdfPreviewUrl(signedUrl, 'report.pdf')).not.toContain('/api/documents/preview');
  });

  it('requests translation by authorized message attachment identifiers, not by signed URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      inputFileName: 'report.pdf',
      outputDir: '/tmp/babeldoc-1',
      outputFiles: [{ fileName: 'report.zh.pdf', id: 'translated-file-1', url: '/api/v2/documents/translate/file?id=translated-file-1' }],
      stdout: '',
      stderr: '',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    mockUseMessages.mockReturnValue({
      data: [{
        id: 'message-1',
        content: '',
        senderRole: 'PATIENT',
        senderName: 'Patient One',
        createdAt: '2026-04-28T10:00:00.000Z',
        attachments: [{
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          storageKey: 'crm/dev/messages/conversation-1/asset-1/report.pdf',
          url: 'https://signed.example.com/report.pdf?token=abc',
        }],
      }],
      refetch: mockRefetch,
    });

    render(
      <ChatPanel
        conversation={{
          id: 'conversation-1',
          category: 'ADMIN_PATIENT',
          participantName: 'Patient One',
        }}
        showInfoPanel={false}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Open report.pdf' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/documents/translate', expect.objectContaining({
        method: 'POST',
      }));
    });
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body).toMatchObject({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      storageKey: 'crm/dev/messages/conversation-1/asset-1/report.pdf',
      fileName: 'report.pdf',
      targetLanguage: 'en',
      outputMode: 'mono',
    });
    expect(body).not.toHaveProperty('sourceUrl');
    expect(JSON.stringify(body)).not.toContain('https://signed.example.com');
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('/tmp/babeldoc-1/report.zh.pdf');
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
