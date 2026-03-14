import sanitizeHtml from 'sanitize-html';

/** Strip ALL HTML — for plain text fields (names, titles, case numbers). */
export function sanitizePlainText(input: string): string {
  return sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} });
}

/** Limited HTML allowlist — for rich text fields (messages, bios, descriptions). */
export function sanitizeRichText(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['https'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
        target: '_blank',
      }),
    },
  });
}

/** Validate URL protocol — for image_url, video_url, website fields. */
export function sanitizeUrl(input: string): string | null {
  try {
    const url = new URL(input);
    if (url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
