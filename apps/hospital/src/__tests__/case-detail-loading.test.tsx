import React from 'react';
// @ts-expect-error hospital tests do not include react-dom type declarations
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@medical-crm/ui', () => ({
  LoadingSpinner: ({ size }: { size?: string }) => <div data-testid="spinner" data-size={size ?? ''} />,
}));

vi.mock('@/lib/hospital-i18n', () => ({
  useHospitalI18n: () => ({
    t: (key: string) => {
      if (key === 'hospital.loading.caseDetail') {
        return 'Localized case detail loading';
      }

      return key;
    },
  }),
}));

describe('CaseDetailLoading', () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
  });

  it('renders a visible loading state for case detail navigation', async () => {
    const { default: CaseDetailLoading } = await import('@/app/(portal)/cases/[id]/loading');
    const markup = renderToStaticMarkup(<CaseDetailLoading />);

    expect(markup).toContain('data-testid="spinner"');
    expect(markup).toContain('Localized case detail loading');
    expect(markup).toContain('aria-live="polite"');
  });
});
