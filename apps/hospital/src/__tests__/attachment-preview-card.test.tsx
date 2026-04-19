import React from 'react';
// @ts-expect-error hospital tests do not include react-dom type declarations
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseHospitalI18n = vi.fn();

vi.mock('@/lib/hospital-i18n', () => ({
  useHospitalI18n: mockUseHospitalI18n,
}));

describe('AttachmentPreviewCard', () => {
  beforeEach(() => {
    mockUseHospitalI18n.mockReturnValue({
      locale: 'fr',
      t: (key: string, values?: Record<string, string | number>, fallback?: string) => {
        const messages: Record<string, string> = {
          'hospital.attachments.preview.status.pending': 'Televersement en attente',
          'hospital.attachments.preview.status.attached': 'Joint',
          'hospital.attachments.preview.kind.pdf': 'Apercu PDF',
          'hospital.attachments.preview.kind.image': 'Apercu image',
          'hospital.attachments.preview.kind.file': 'Piece jointe',
          'hospital.attachments.fileSize.kb': '{value} Ko',
          'hospital.attachments.fileSize.mb': '{value} Mo',
          'hospital.attachments.fileSize.bytes': '{value} o',
          'hospital.attachments.preview.remove': 'Supprimer la piece jointe',
          'hospital.attachments.preview.frameTitle': 'Apercu de {fileName}',
        };

        const template = messages[key] ?? fallback ?? key;
        return template.replace(/\{(\w+)\}/g, (_, token: string) =>
          String(values?.[token] ?? `{${token}}`),
        );
      },
      has: () => true,
      isSwitchingLocale: false,
      setLocale: vi.fn(),
    });
  });

  it('renders translated status, preview text, remove label, and file size units', async () => {
    const { AttachmentPreviewCard } = await import('@/components/attachment-preview-card');
    const markup = renderToStaticMarkup(
      <AttachmentPreviewCard
        fileName="brochure.pdf"
        mimeType="application/pdf"
        fileSize={2_048}
        pending
        url="https://example.com/brochure.pdf"
        onRemove={() => undefined}
      />,
    );

    expect(markup).toContain('Televersement en attente');
    expect(markup).toContain('Apercu PDF');
    expect(markup).toContain('2 Ko');
    expect(markup).toContain('Supprimer la piece jointe');
    expect(markup).toContain('title="Apercu de brochure.pdf"');
  });
});
