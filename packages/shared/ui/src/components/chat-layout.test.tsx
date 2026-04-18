import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatLayout } from './chat-layout';

describe('ChatLayout', () => {
  it('renders AI messages with a distinct non-admin avatar style', () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <ChatLayout
        messages={[{
          id: 'msg-ai-1',
          content: 'Automated follow-up from the assistant.',
          senderRole: 'AI' as never,
          senderName: 'AI · Medora AI',
          createdAt: '2026-04-18T10:00:00.000Z',
        }]}
        onSend={vi.fn()}
        canSend={false}
        currentUserRole="ADMIN"
      />,
    );

    expect(screen.getByText('AI · Medora AI')).toBeTruthy();
    const avatar = screen.getByTitle('AI · Medora AI');
    expect(avatar.className).toContain('from-amber-500');
    expect(avatar.className).toContain('to-orange-500');
  });

  it('renders a custom header action inside the chat header area', () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <ChatLayout
        messages={[]}
        onSend={vi.fn()}
        canSend={false}
        currentUserRole="ADMIN"
        header={{
          name: 'Patient One',
          action: <button type="button">恢复 Medora AI</button>,
        }}
      />,
    );

    expect(screen.getByRole('button', { name: '恢复 Medora AI' })).toBeTruthy();
    expect(screen.getByText('Patient One')).toBeTruthy();
  });
});
