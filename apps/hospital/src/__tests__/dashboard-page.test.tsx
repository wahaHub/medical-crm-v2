import React from 'react';
// @ts-expect-error hospital tests do not include react-dom type declarations
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/errors';

const mockApiClient = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

vi.mock('@/lib/api-client', () => ({
  apiClient: mockApiClient,
  isUnauthorizedApiError: (error: unknown) => error instanceof ApiError && error.status === 401,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('@/components/dashboard-widgets', () => ({
  DashboardWidgets: ({ data }: { data: {
    scheduledConsultations: Array<unknown>;
    recentCases: Array<unknown>;
    pendingMessages: Array<unknown>;
  } }) => (
    <div
      data-testid="dashboard-widgets"
      data-consultations={data.scheduledConsultations.length}
      data-cases={data.recentCases.length}
      data-messages={data.pendingMessages.length}
    />
  ),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    mockApiClient.mockReset();
    mockRedirect.mockClear();
  });

  it('redirects to login when any dashboard request returns 401', async () => {
    mockApiClient
      .mockRejectedValueOnce(new ApiError(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce({
        data: [{
          id: 'consultation-1',
          patientName: 'Alice',
          scheduledAt: '2026-04-20T10:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        data: [{
          id: 'conversation-1',
          title: 'Alice - Follow-up',
          unreadCount: 2,
          updatedAt: '2026-04-20T10:00:00.000Z',
        }],
      });

    const { default: DashboardPage } = await import('@/app/(portal)/dashboard/page');

    await expect(DashboardPage()).rejects.toThrow('REDIRECT:/auth/login');
  });

  it('keeps rendering when one dashboard request returns 503 and the others succeed', async () => {
    mockApiClient
      .mockRejectedValueOnce(new ApiError(503, { error: 'Service temporarily unavailable' }))
      .mockResolvedValueOnce({
        data: [{
          id: 'consultation-1',
          patientName: 'Alice',
          scheduledAt: '2026-04-20T10:00:00.000Z',
        }],
      })
      .mockResolvedValueOnce({
        data: [{
          id: 'conversation-1',
          title: 'Alice - Follow-up',
          unreadCount: 2,
          updatedAt: '2026-04-20T10:00:00.000Z',
        }],
      });

    const { default: DashboardPage } = await import('@/app/(portal)/dashboard/page');
    const markup = renderToStaticMarkup(await DashboardPage());

    expect(markup).toContain('data-testid="dashboard-widgets"');
    expect(markup).toContain('data-cases="0"');
    expect(markup).toContain('data-consultations="1"');
    expect(markup).toContain('data-messages="1"');
  });
});
