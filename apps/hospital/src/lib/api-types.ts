// apps/hospital/src/lib/api-types.ts
// Lightweight types for API responses used across the Hospital Portal.

/** Paginated list response envelope */
export interface PaginatedResponse<T> {
  data: T[];
  total?: number;
  nextCursor?: string | null;
}

/** Flat list response that may or may not have a wrapper */
export type ListResponse<T> = PaginatedResponse<T> | T[];

/** Case summary returned by the list endpoint */
export interface CaseSummary {
  id: string;
  caseNumber?: string;
  patientName?: string;
  patientCode?: string;
  patientCountry?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  status?: string;
  assignmentStatus?: string;
  stage?: string;
  treatmentStage?: string | null;
  riskLevel?: string | null;
  medicalCondition?: string | null;
  primaryDiagnosis?: string | null;
  notes?: string | null;
  assignedHospitalId?: string | null;
  totalDocuments?: number;
  totalMessages?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Phone call record */
export interface PhoneCallItem {
  id: string;
  title?: string;
  callResult?: string | null;
  summary?: string | null;
  duration?: number | null;
  nextFollowUp?: string | null;
  recordedAt?: string;
}

/** Consultation history record */
export interface ConsultationHistoryItem {
  id: string;
  title?: string;
  description?: string | null;
  recordedAt?: string;
}

/** Case detail DTO returned by GET /cases/:id for HOSPITAL role */
export interface HospitalCaseDetail {
  id: string;
  caseNumber: string;
  displayStatus: string;
  patient: {
    id: string;
    name: string;
    code: string;
    country: string | null;
    language: string;
    age: number | null;
    gender: string | null;
  };
  medicalCondition: {
    primaryDiagnosis: string | null;
    diagnosisCode: string | null;
    symptoms: string[] | null;
    medicalHistory: string | null;
  };
  aiSummary: string | null;
  riskLevel: string | null;
  diagnoses: DiagnosisItem[];
  phoneCalls?: PhoneCallItem[];
  consultationHistory?: ConsultationHistoryItem[];
  documents: DocumentItem[];
  messageSections: HospitalCaseMessageSection[];
  totalMessages: number;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalCaseMessageSection {
  id: 'admin-patient' | 'hospital-patient';
  title: string;
  conversationCategory: 'ADMIN_PATIENT' | 'HOSPITAL_PATIENT';
  conversationId: string | null;
  messages: MessageItem[];
  totalMessages: number;
}

/** Stats shapes */
/** Matches backend CaseStatsDTO */
export interface CaseStats {
  total?: number;
  unassigned?: number;
  assigned?: number;
  inTreatment?: number;
  postTreatment?: number;
  completed?: number;
  followUp?: number;
}

export interface ConsultationStats {
  total?: number;
  scheduled?: number;
  completed?: number;
  cancelled?: number;
}

/** Consultation summary */
export interface ConsultationSummary {
  id: string;
  caseId?: string;
  patientName?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  status?: string;
  notes?: string | null;
}

/** Conversation summary */
export interface ConversationSummary {
  id: string;
  caseId?: string | null;
  title?: string;
  patientName?: string;
  category?: string;
  lastMessagePreview?: string;
  unreadCount?: number;
  updatedAt?: string;
}

/** Message item returned by conversations/:id/messages */
export interface MessageItem {
  id: string;
  conversationId: string;
  senderId?: string;
  senderRole?: string;
  senderName?: string;
  content: string;
  translatedContent?: string | null;
  contentTranslated?: string | null;
  messageType?: string;
  aiSummary?: string | null;
  moderationStatus?: string;
  attachments?: Array<{
    url?: string;
    name?: string;
    type?: string;
    size?: number;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    storageKey?: string;
  }> | null;
  createdAt: string;
  updatedAt?: string;
}

/** Document item — matches backend DocumentWithUrlDTO */
export interface DocumentItem {
  id: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  documentType?: string;
  sensitivity?: string;
  language?: string;
  isTranslated?: boolean;
  downloadUrl?: string;
  createdAt?: string;
  /** @deprecated use documentType */
  type?: string;
  /** @deprecated use downloadUrl */
  fileUrl?: string;
  status?: string;
}

/** Diagnosis item — matches backend DiagnosisDTO */
export interface DiagnosisItem {
  id?: string;
  title?: string;
  icdCode?: string | null;
  severity?: string | null;
  treatmentRecommendation?: string | null;
  suggestedTests?: string | null;
  costEstimate?: string | null;
  treatmentDuration?: string | null;
  recordedAt?: string;
  /** @deprecated kept for backward compat */
  condition?: string;
  /** @deprecated kept for backward compat */
  notes?: string;
}

/** Progress response */
export interface CaseProgressResponse {
  diagnoses?: DiagnosisItem[];
}

/** Hospital materials info — matches MaterialsHospitalInfo domain type */
export interface MaterialsHospitalInfoDTO {
  id: string;
  name: string;
  slug: string;
  heroImage: string | null;
  heroImageStorageKey?: string | null;
  photos: string[];
  photoStorageKeys?: Array<string | null>;
  highlights: Array<{ icon: string; text: string }>;
  // Extended fields
  nameEn?: string;
  yearEstablished?: number;
  totalPatients?: number;
  tagline?: string;
  taglineEn?: string;
  description?: string;
  descriptionEn?: string;
  status?: string;
  isActive?: boolean;
  paymentMethods?: string[];
  // Contact & Location
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  hours?: string;
  latitude?: number;
  longitude?: number;
  mapEmbed?: string;
  operatingHours?: string;
  // CRM metadata fields
  certifications?: Array<{ id: string; name: string; nameEn?: string; year?: number; isActive: boolean }>;
  bedCount?: number;
  patientCapacity?: number;
  recommendRate?: number;
  multilingualStaff?: string[];
  airportServices?: string[];
  followUpCare?: string[];
  amenities?: string[];
  nearbyAttractions?: Array<{ id: string; name: string; nameEn?: string; distance: string }>;
  videoTestimonials?: Array<{
    id: string;
    patientName: string;
    patientCountry?: string;
    procedureName?: string;
    videoUrl: string;
    videoStorageKey?: string | null;
    thumbnailUrl?: string;
    thumbnailStorageKey?: string | null;
    duration?: string;
    uploadedAt?: string;
  }>;
  // Regular hospital specific fields
  city?: string;
  district?: string;
  province?: string;
  hospitalType?: string;
  tier?: string;
  ownershipType?: string;
  clinicalCapabilities?: string[];
  equipment?: Array<{ name: string; image_url?: string; imageStorageKey?: string | null; description?: string }>;
  gallery?: Array<{ url: string; alt: string; type: string }>;
  coreSpecialties?: Array<{ name: string; slug: string; image_url?: string; description: string; technologies: string[] }>;
  overview?: string;
  overviewEn?: string;
  fullDescription?: string;
  fullDescriptionEn?: string;
  departments?: string[];
  departmentDescriptions?: Record<string, string>;
  departmentImages?: Record<string, string>;
  departmentImageStorageKeys?: Record<string, string>;
  departmentKeyServices?: Record<string, string[]>;
  departmentStats?: Record<string, { specialists?: number; annualPatients?: number }>;
  promotionalVideos?: string[];
  promotionalVideoStorageKeys?: Array<string | null>;
  pdfDocuments?: Array<{
    id: string;
    fileName: string;
    url: string;
    storageKey?: string | null;
    mimeType?: string;
    fileSize?: number;
    uploadedAt?: string;
  }>;
}

/** Materials procedure — matches MaterialsProcedure domain type */
export interface MaterialsProcedureDTO {
  id: string;
  hospitalId: string;
  procedureName: string;
  description: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceRange: string | null;
  isPopular: boolean;
  sortOrder: number;
  recoveryTime?: string | null;
  duration?: string | null;
  hospitalStayDays?: string | null;
  indications?: string | null;
  risks?: string | null;
  inclusions?: string[];
}

/** Materials surgeon — matches MaterialsSurgeon domain type */
export interface MaterialsSurgeonDTO {
  id: string;
  hospitalId: string;
  name: string;
  title: string | null;
  imageUrl: string | null;
  experienceYears: number | null;
  specialties: string[];
  languages: string[];
  education: string[];
  certifications: string[];
  intro: string | null;
  expertise: string | null;
  philosophy: string | null;
  achievements: string[];
}

/** Quote item — matches backend QuoteDTO */
export interface QuoteItem {
  id: string;
  caseId: string;
  hospitalId: string;
  hospitalName?: string;
  quoteNumber?: string;
  version?: number;
  isDraft?: boolean;
  totalAmount: string;
  currency: string;
  lineItems?: Array<{ name: string; amount: string }>;
  treatmentPlan?: string | null;
  notes?: string | null;
  validUntil?: string | null;
  status: string; // PENDING | ACCEPTED | REJECTED | EXPIRED
  sentAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Email template attachment */
export interface EmailTemplateAttachmentItem {
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
  url?: string;
}

/** Email template item */
export interface EmailTemplateItem {
  id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  attachments: EmailTemplateAttachmentItem[];
  createdAt: string;
  updatedAt: string;
}

/** FAQ attachment — matches backend FaqAttachmentDTO */
export interface FaqAttachmentItem {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  url?: string;
}

/** FAQ item — matches backend ChatbotFaqDTO */
export interface FaqItem {
  id: string;
  hospitalId?: string | null;
  category: string;
  question: string;
  answer: string;
  hospitalType: 'REGULAR' | 'COSMETIC';
  keywords: string[];
  attachments?: FaqAttachmentItem[];
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/** Materials before/after case — matches MaterialsBeforeAfterCase domain type */
export interface MaterialsBeforeAfterCaseMediaDTO {
  type: 'image' | 'video';
  url: string;
  thumbnailUrl?: string | null;
}

export interface MaterialsBeforeAfterCaseDTO {
  id: string;
  hospitalId: string;
  procedureName: string;
  surgeonName: string | null;
  description: string | null;
  images: Array<{ url: string }>;
  media: MaterialsBeforeAfterCaseMediaDTO[];
}

/** Materials review media item */
export interface MaterialsReviewMediaDTO {
  id: string;
  type: 'image' | 'video';
  url: string;
  storageKey?: string | null;
  thumbnailUrl: string | null;
  thumbnailStorageKey?: string | null;
  caption: string | null;
  sortOrder: number;
}

/** Materials review — hospital-level patient review content */
export interface MaterialsReviewDTO {
  id: string;
  sortOrder: number;
  isActive: boolean;
  featured: boolean;
  patientName: string;
  patientCountry: string | null;
  patientAvatarUrl: string | null;
  patientAvatarStorageKey?: string | null;
  treatmentName: string;
  reviewTitle: string;
  reviewComment: string;
  rating: number;
  reviewDate: string | null;
  media: MaterialsReviewMediaDTO[];
  translations?: Record<string, Record<string, unknown>>;
}

/** Materials package gallery item */
export interface MaterialsPackageGalleryItemDTO {
  id: string;
  imageUrl: string;
  storageKey?: string | null;
  sortOrder: number;
}

/** Materials package tag item */
export interface MaterialsPackageTagDTO {
  id: string;
  label: string;
  category: string;
}

/** Materials package include item */
export interface MaterialsPackageIncludeDTO {
  id: string;
  text: string;
  sortOrder: number;
}

/** Materials package process step */
export interface MaterialsPackageProcessDTO {
  id: string;
  stepTitle: string;
  description: string;
  sortOrder: number;
}

/** Materials package patient case item */
export interface MaterialsPackageCaseDTO {
  id: string;
  patientName: string;
  patientAge: number | null;
  patientCountry: string | null;
  story: string;
  result: string;
  sortOrder: number;
}

/** Materials package review item */
export interface MaterialsPackageReviewDTO {
  id: string;
  reviewerName: string;
  reviewerCountry: string | null;
  rating: number;
  reviewDate: string | null;
  comment: string;
  sortOrder: number;
  isActive: boolean;
}

/** Materials package — hospital-owned package detail payload */
export interface MaterialsPackageDTO {
  id: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  title: string;
  subtitle: string | null;
  coverImageUrl: string;
  coverImageStorageKey?: string | null;
  gallery: MaterialsPackageGalleryItemDTO[];
  price: string;
  currency: string;
  duration: string | null;
  summary: string;
  tags: MaterialsPackageTagDTO[];
  includes: MaterialsPackageIncludeDTO[];
  process: MaterialsPackageProcessDTO[];
  cases: MaterialsPackageCaseDTO[];
  reviews: MaterialsPackageReviewDTO[];
  translations?: Record<string, Record<string, unknown>>;
}
