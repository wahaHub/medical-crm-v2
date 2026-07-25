export interface GuideCategoryDefinition {
  value: 'china_healthcare' | 'treatment' | 'clinical_trials_advanced_treatments' | 'hospital' | 'patient_journey' | 'cost_insurance' | 'patient_education_faq';
  label: string;
  description: string;
  featured?: boolean;
}

export const GUIDE_CATEGORIES: readonly GuideCategoryDefinition[] = [
  { value: 'china_healthcare', label: 'China Healthcare Guides', description: 'Healthcare access, systems, and practical care guidance.' },
  { value: 'treatment', label: 'Treatment Guides', description: 'Treatment planning and procedure-focused information.' },
  { value: 'clinical_trials_advanced_treatments', label: 'Clinical Trials & Advanced Treatments', description: 'Featured treatment content for advanced options and clinical trials.', featured: true },
  { value: 'hospital', label: 'Hospital Guides', description: 'Hospital selection and care-setting guidance.' },
  { value: 'patient_journey', label: 'Patient Journey Guides', description: 'What to expect before, during, and after care.' },
  { value: 'cost_insurance', label: 'Cost & Insurance Guides', description: 'Pricing, payment, and coverage information.' },
  { value: 'patient_education_faq', label: 'Patient Education & FAQ', description: 'Plain-language patient education and common questions.' },
] as const;

export type GuideCategory = GuideCategoryDefinition['value'];
export type GuideStatus = 'DRAFT' | 'PUBLISHED';

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

export const emptyGuideContentDocument: GuideContentDocument = { type: 'doc', content: [{ type: 'paragraph' }] };

export function withGuideImagePreviews(document: GuideContentDocument, imageUrls: Record<string, string>): GuideContentDocument {
  const mapNode = (node: GuideContentNode): GuideContentNode => {
    const storageKey = node.type === 'image' && typeof (node.attrs?.storageKey ?? node.attrs?.src) === 'string'
      ? String(node.attrs?.storageKey ?? node.attrs?.src) : null;
    return {
      ...node,
      ...(storageKey ? { attrs: { ...node.attrs, storageKey, src: imageUrls[storageKey] ?? node.attrs?.src } } : {}),
      ...(node.content ? { content: node.content.map(mapNode) } : {}),
    };
  };
  return { type: 'doc', content: document.content.map(mapNode) };
}

export function guideContentText(document: GuideContentDocument): string {
  const pieces: string[] = [];
  const visit = (node: GuideContentNode) => { if (node.type === 'text' && node.text) pieces.push(node.text); node.content?.forEach(visit); };
  document.content.forEach(visit);
  return pieces.join(' ').replace(/\s+/g, ' ').trim();
}

export interface RelatedTreatment {
  procedureId: string;
  hospitalId: string;
  procedureName: string;
  hospitalName: string;
}

export interface GuideFaq {
  id: string;
  question: string;
  answer: string;
}

export interface Guide {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  heroImageUrl: string | null;
  heroImageStorageKey: string | null;
  category: GuideCategory;
  reviewedBy: string | null;
  updatedDate: string;
  keyTakeaways: string[];
  contentDocument: GuideContentDocument;
  contentHtml: string;
  contentText: string;
  contentImageUrls: Record<string, string>;
  relatedHospitalIds: string[];
  relatedTreatments: RelatedTreatment[];
  relatedGuideIds: string[];
  faqs: GuideFaq[];
  status: GuideStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getGuideCategory(category: string) {
  return GUIDE_CATEGORIES.find((item) => item.value === category);
}

export function formatGuideDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}
