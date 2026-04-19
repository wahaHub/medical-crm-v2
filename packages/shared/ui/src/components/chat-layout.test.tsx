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

  it('supports custom labels and locale-aware formatters for hospital messaging', () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();

    render(
      <ChatLayout
        messages={[{
          id: 'msg-1',
          content: 'Bonjour',
          translatedContent: 'Hello',
          senderRole: 'PATIENT',
          senderName: 'Marie Curie',
          createdAt: '2026-04-18T10:00:00.000Z',
          isAiTranslated: true,
          aiSummary: 'Patient asks about recovery time.',
          attachments: [{}],
        }]}
        onSend={vi.fn()}
        onToggleTranslation={vi.fn()}
        showTranslation
        showRetranslate
        onRetranslate={vi.fn()}
        onUploadFiles={vi.fn()}
        currentUserRole="HOSPITAL"
        header={{ name: 'Marie Curie', isOnline: true }}
        labels={{
          online: 'Verbunden',
          showTranslation: 'Uebersetzung zeigen',
          aiSummaryPrefix: 'KI-Zusammenfassung',
          fileFallbackName: 'Datei',
          fileTypeFallback: 'DATEI',
          aiTranslated: 'KI uebersetzt',
          retranslate: 'Erneut uebersetzen',
          attachFiles: 'Dateien anhaengen',
          typeMessagePlaceholder: 'Nachricht schreiben...',
          today: 'Heute',
        }}
        formatMessageTime={() => '14:30'}
        formatDateDivider={() => 'Heute'}
      />,
    );

    expect(screen.getByText('Verbunden')).toBeTruthy();
    expect(screen.getByText('Uebersetzung zeigen')).toBeTruthy();
    expect(screen.getByText('Heute')).toBeTruthy();
    expect(screen.getByText('14:30')).toBeTruthy();
    expect(screen.getByText('KI-Zusammenfassung: Patient asks about recovery time.')).toBeTruthy();
    expect(screen.getByText('Datei')).toBeTruthy();
    expect(screen.getByText('DATEI')).toBeTruthy();
    expect(screen.getByText('KI uebersetzt')).toBeTruthy();
    expect(screen.getByTitle('Erneut uebersetzen')).toBeTruthy();
    expect(screen.getByTitle('Dateien anhaengen')).toBeTruthy();
    expect(screen.getByPlaceholderText('Nachricht schreiben...')).toBeTruthy();
  });
});
