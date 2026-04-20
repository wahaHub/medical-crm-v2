import React from 'react';
// @ts-expect-error hospital tests do not include react-dom type declarations
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockApiClient = vi.fn();
const mockApiFetch = vi.fn();
const mockLoadMessages = vi.fn(async () => ({ hospital: { portal: { messages: { page: {} } } } }));

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
}));

vi.mock('@/lib/api-fetch', () => ({
  apiFetch: mockApiFetch,
}));

vi.mock('@/components/messages-view', () => ({
  MessagesView: ({
    initialConversations,
    initialConversationId,
  }: {
    initialConversations: { data: Array<unknown> };
    initialConversationId?: string | null;
  }) => (
    <div
      data-testid="messages-view"
      data-count={initialConversations.data.length}
      data-conversation-id={initialConversationId ?? ''}
    />
  ),
}));

vi.mock('@medical-crm/i18n', async () => {
  const actual = await vi.importActual<typeof import('@medical-crm/i18n')>('@medical-crm/i18n');
  return {
    ...actual,
    loadMessages: mockLoadMessages,
    normalizeLocale: (locale?: string) => locale ?? 'en',
    translateMessage: (_messages: unknown, _key: string, _values?: Record<string, unknown>, fallback?: string) =>
      fallback ?? _key,
  };
});

describe('MessagesPage', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    mockApiClient.mockReset();
    mockApiFetch.mockReset();
    mockLoadMessages.mockClear();
  });

  it('keeps rendering the page shell when conversations fail to load on the server', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ preferredLanguage: 'fr' }),
    });
    mockApiClient.mockRejectedValue(new Error('Service unavailable'));

    const { default: MessagesPage } = await import('@/app/(portal)/messages/page');

    const markup = renderToStaticMarkup(
      await MessagesPage({
        searchParams: Promise.resolve({ conversation: 'conv-1' }),
      }),
    );

    expect(mockLoadMessages).toHaveBeenCalledWith('fr');
    expect(markup).toContain('Messages');
    expect(markup).toContain('CRM Forwarding Mode');
    expect(markup).toContain('data-testid="messages-view"');
    expect(markup).toContain('data-count="0"');
    expect(markup).toContain('data-conversation-id="conv-1"');
  });
});
