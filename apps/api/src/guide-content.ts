export interface GuideContentNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: GuideContentNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

export interface GuideContentDocument {
  type: 'doc';
  content: GuideContentNode[];
}

const MAX_DOCUMENT_BYTES = 250_000;
const MAX_DEPTH = 12;
const guideImageKeyPrefix = `crm/${process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev'}/admin/guides/`;

export const emptyGuideContentDocument: GuideContentDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

export function isGuideImageStorageKey(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(guideImageKeyPrefix);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

function normalizeMarks(value: unknown): GuideContentNode['marks'] {
  if (!Array.isArray(value)) return undefined;
  const marks = value.flatMap((mark) => {
    if (!isRecord(mark) || typeof mark.type !== 'string') return [];
    if (mark.type === 'bold' || mark.type === 'italic' || mark.type === 'underline' || mark.type === 'strike') {
      return [{ type: mark.type }];
    }
    if (mark.type === 'link') {
      const href = asString(isRecord(mark.attrs) ? mark.attrs.href : undefined, 2000);
      if (/^(https?:|mailto:)/i.test(href)) return [{ type: 'link', attrs: { href } }];
    }
    return [];
  });
  return marks.length ? marks : undefined;
}

function normalizeChildren(value: unknown, depth: number): GuideContentNode[] {
  if (!Array.isArray(value) || depth > MAX_DEPTH) return [];
  return value.flatMap((node) => {
    const normalized = normalizeNode(node, depth + 1);
    return normalized ? [normalized] : [];
  });
}

function normalizeNode(value: unknown, depth = 0): GuideContentNode | null {
  if (!isRecord(value) || typeof value.type !== 'string' || depth > MAX_DEPTH) return null;
  const content = normalizeChildren(value.content, depth);

  switch (value.type) {
    case 'text': {
      const text = asString(value.text, 20_000);
      return text ? { type: 'text', text, marks: normalizeMarks(value.marks) } : null;
    }
    case 'paragraph':
    case 'blockquote':
    case 'listItem':
    case 'tableCell':
    case 'tableHeader':
      return { type: value.type, ...(content.length ? { content } : {}) };
    case 'bulletList':
    case 'orderedList':
    case 'tableRow':
      return content.length ? { type: value.type, content } : null;
    case 'heading': {
      const level = isRecord(value.attrs) && [2, 3, 4].includes(Number(value.attrs.level)) ? Number(value.attrs.level) : 2;
      return content.length ? { type: 'heading', attrs: { level }, content } : null;
    }
    case 'horizontalRule':
    case 'hardBreak':
      return { type: value.type };
    case 'image': {
      const rawAttrs = isRecord(value.attrs) ? value.attrs : {};
      const storageKey = asString(rawAttrs.storageKey ?? rawAttrs.src, 1000);
      if (!isGuideImageStorageKey(storageKey)) return null;
      return {
        type: 'image',
        attrs: {
          src: storageKey,
          storageKey,
          alt: asString(rawAttrs.alt, 300),
          title: asString(rawAttrs.title, 300),
        },
      };
    }
    case 'table':
      return content.length ? { type: 'table', content } : null;
    default:
      return null;
  }
}

export function normalizeGuideContent(value: unknown): GuideContentDocument | null {
  if (!isRecord(value) || value.type !== 'doc' || !Array.isArray(value.content)) return null;
  if (JSON.stringify(value).length > MAX_DOCUMENT_BYTES) return null;
  const content = normalizeChildren(value.content, 0);
  return { type: 'doc', content: content.length ? content : emptyGuideContentDocument.content };
}

export function guideContentText(document: GuideContentDocument): string {
  const pieces: string[] = [];
  const visit = (node: GuideContentNode) => {
    if (node.type === 'text' && node.text) pieces.push(node.text);
    if (node.type === 'image' && typeof node.attrs?.alt === 'string') pieces.push(node.attrs.alt);
    node.content?.forEach(visit);
  };
  document.content.forEach(visit);
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

export function guideContentImageKeys(document: GuideContentDocument): string[] {
  const keys = new Set<string>();
  const visit = (node: GuideContentNode) => {
    if (node.type === 'image') {
      const key = node.attrs?.storageKey ?? node.attrs?.src;
      if (isGuideImageStorageKey(key)) keys.add(key);
    }
    node.content?.forEach(visit);
  };
  document.content.forEach(visit);
  return [...keys];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function renderText(node: GuideContentNode): string {
  let html = escapeHtml(node.text ?? '');
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') html = `<strong>${html}</strong>`;
    if (mark.type === 'italic') html = `<em>${html}</em>`;
    if (mark.type === 'underline') html = `<u>${html}</u>`;
    if (mark.type === 'strike') html = `<s>${html}</s>`;
    if (mark.type === 'link' && typeof mark.attrs?.href === 'string' && /^(https?:|mailto:)/i.test(mark.attrs.href)) {
      html = `<a href="${escapeHtml(mark.attrs.href)}" rel="noopener noreferrer" target="_blank">${html}</a>`;
    }
  }
  return html;
}

function contentHtml(nodes: GuideContentNode[], imageUrl: (key: string) => string): string {
  return nodes.map((node) => renderNode(node, imageUrl)).join('');
}

function renderNode(node: GuideContentNode, imageUrl: (key: string) => string): string {
  const children = contentHtml(node.content ?? [], imageUrl);
  switch (node.type) {
    case 'text': return renderText(node);
    case 'paragraph': return `<p>${children || '<br>'}</p>`;
    case 'heading': return `<h${node.attrs?.level === 3 ? 3 : node.attrs?.level === 4 ? 4 : 2}>${children}</h${node.attrs?.level === 3 ? 3 : node.attrs?.level === 4 ? 4 : 2}>`;
    case 'bulletList': return `<ul>${children}</ul>`;
    case 'orderedList': return `<ol>${children}</ol>`;
    case 'listItem': return `<li>${children}</li>`;
    case 'blockquote': return `<blockquote>${children}</blockquote>`;
    case 'horizontalRule': return '<hr>';
    case 'hardBreak': return '<br>';
    case 'image': {
      const storageKey = node.attrs?.storageKey ?? node.attrs?.src;
      if (typeof storageKey !== 'string') return '';
      const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt : '';
      const title = typeof node.attrs?.title === 'string' ? node.attrs.title : '';
      return `<figure><img src="${escapeHtml(imageUrl(storageKey))}" alt="${escapeHtml(alt)}" loading="lazy">${title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ''}</figure>`;
    }
    case 'table': return `<div class="guide-table-wrap"><table><tbody>${children}</tbody></table></div>`;
    case 'tableRow': return `<tr>${children}</tr>`;
    case 'tableCell': return `<td>${children}</td>`;
    case 'tableHeader': return `<th>${children}</th>`;
    default: return '';
  }
}

export function renderGuideContentHtml(document: GuideContentDocument, imageUrl: (key: string) => string): string {
  return contentHtml(document.content, imageUrl);
}
