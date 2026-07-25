import { describe, expect, it } from 'vitest';
import {
  guideContentImageKeys,
  guideContentText,
  isGuideImageStorageKey,
  normalizeGuideContent,
  renderGuideContentHtml,
} from '../guide-content.js';

const guideImageKey = 'crm/dev/admin/guides/draft_guide/image-1/example.webp';

describe('Guide rich content', () => {
  it('keeps supported content and renders only escaped, allowlisted HTML', () => {
    const document = normalizeGuideContent({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Care <plan>' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Read more', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] },
        { type: 'image', attrs: { src: guideImageKey, alt: 'Hospital room' } },
      ],
    });

    expect(document).not.toBeNull();
    expect(guideContentText(document!)).toContain('Care <plan>');
    expect(guideContentImageKeys(document!)).toEqual([guideImageKey]);
    expect(renderGuideContentHtml(document!, () => '/guide-image')).toContain('&lt;plan&gt;');
    expect(renderGuideContentHtml(document!, () => '/guide-image')).toContain('<img src="/guide-image" alt="Hospital room" loading="lazy">');
  });

  it('rejects non-guide storage keys so private attachments cannot be rendered publicly', () => {
    expect(isGuideImageStorageKey('crm/dev/cases/documents/case-1/report.pdf')).toBe(false);
    expect(isGuideImageStorageKey('https://untrusted.example/image.jpg')).toBe(false);
    expect(normalizeGuideContent({
      type: 'doc',
      content: [{ type: 'image', attrs: { src: 'crm/dev/cases/documents/case-1/report.pdf' } }],
    })).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
});
