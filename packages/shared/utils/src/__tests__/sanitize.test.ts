import { describe, it, expect } from 'vitest';
import { sanitizePlainText, sanitizeRichText, sanitizeUrl } from '../sanitize';

describe('sanitizePlainText', () => {
  it('strips all HTML tags', () => {
    expect(sanitizePlainText('<b>hello</b>')).toBe('hello');
  });

  it('strips script tags and content', () => {
    expect(sanitizePlainText('hi<script>alert(1)</script>bye')).toBe('hibye');
  });

  it('preserves plain text', () => {
    expect(sanitizePlainText('hello world')).toBe('hello world');
  });
});

describe('sanitizeRichText', () => {
  it('preserves allowed tags', () => {
    const input = '<p>Hello <strong>world</strong></p>';
    expect(sanitizeRichText(input)).toBe(input);
  });

  it('strips script tags', () => {
    expect(sanitizeRichText('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
  });

  it('strips img tags', () => {
    expect(sanitizeRichText('<p>text</p><img src="x" onerror="alert(1)">')).toBe('<p>text</p>');
  });

  it('strips iframe tags', () => {
    expect(sanitizeRichText('<iframe src="evil.com"></iframe>')).toBe('');
  });

  it('strips event handlers from allowed tags', () => {
    expect(sanitizeRichText('<p onclick="alert(1)">text</p>')).toBe('<p>text</p>');
  });

  it('adds rel=noopener to links', () => {
    const result = sanitizeRichText('<a href="https://example.com">link</a>');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it('strips javascript: protocol from links', () => {
    const result = sanitizeRichText('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain('javascript');
  });
});

describe('sanitizeUrl', () => {
  it('accepts https URLs', () => {
    expect(sanitizeUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('rejects http URLs (https only)', () => {
    expect(sanitizeUrl('http://example.com')).toBeNull();
  });

  it('rejects javascript: protocol', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects data: protocol', () => {
    expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects invalid URLs', () => {
    expect(sanitizeUrl('not a url')).toBeNull();
  });
});
