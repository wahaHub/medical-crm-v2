# Phase 2A Design: Domain Layer + Case CRUD + Documents + Progress

**Date:** 2026-03-14
**Status:** Review (post spec-review fixes applied)
**Scope:** Domain entities, application use cases, repository implementations, API routes for Case + CaseProgress + Documents

---

## 1. Overview

Phase 1 delivered infrastructure (Hono API, Drizzle ORM, Keycloak auth, Next.js shells). Phase 2A adds the first business logic layer: a Rich Domain Model for Cases, with full CRUD, document management, progress tracking, and role-based access.

### Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Rich Domain Model in `packages/domain/` | Strict boundaries, testable in isolation, ESLint enforced |
| Package layout | 3 new packages: domain, application, infrastructure extensions | Consistent with Phase 1 multi-package pattern |
| API design | RESTful redesign under `/api/v2/`, @hono/zod-openapi | Clean break from v1, auto-generated OpenAPI spec |
| Route organization | Unified endpoints + role-based permission | Single `/api/v2/cases` serves both admin and hospital |
| AI summary storage | Single `ai_summary` + `ai_summary_language` columns | Replaces `ai_summary_zh`/`ai_summary_en`; language-agnostic, regenerate on demand |
| Admin case detail | Deferred | Will be designed alongside expanded admin features in a later phase |
| Invitation letters | Deferred | Independent sub-domain with own lifecycle; separate phase |

### What Is NOT in Scope

- Admin-specific case detail read model (deferred to admin feature phase)
- Invitation letters (independent sub-domain)
- Message/conversation system (Phase 2B)
- Consultation management (Phase 2C)
- Hospital materials management (Phase 2D)
- Frontend UI pages (Phase 2E)
- AI analysis endpoint (deferred — mock in v1, needs real integration design)

---

## 2. Domain Layer (`packages/domain/`)

Depends only on `@medical-crm/utils` for shared error types (`DomainError`, `ValidationError`, etc.). No infrastructure or framework dependencies. All business rules live here.

### 2.1 Entities

#### Case (Aggregate Root)

```typescript
class Case {
  readonly id: string;
  readonly caseNumber: CaseNumber;        // value object
  patientId: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;                // default "en"
  assignedHospitalId: string | null;
  primaryDiagnosis: string | null;
  diagnosisCode: string | null;
  symptoms: string[] | null;
  medicalHistory: string | null;
  aiSummary: string | null;               // single field, any language
  aiSummaryLanguage: string | null;       // "zh", "en", "kr", etc.
  riskLevel: RiskLevel | null;
  status: CaseStatus;
  stage: CaseStage;
  assignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // Business methods
  assign(hospitalId: string): void;
  transitionStatus(to: CaseStatus): void;
  advanceStage(to: CaseStage): void;
  setAiAnalysis(summary: string, language: string, risk: RiskLevel): void;
}
```

#### Document

```typescript
class Document {
  readonly id: string;
  caseId: string;
  uploadedById: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  storageKey: string;
  documentType: DocumentType;
  sensitivity: Sensitivity;
  language: string;
  isTranslated: boolean;
  status: DocumentStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

#### CaseProgress (child of Case aggregate)

```typescript
class CaseProgress {
  readonly id: string;
  caseId: string;
  title: string;
  description: string | null;
  progressType: ProgressType;
  metadata: Record<string, unknown> | null;  // diagnosis details, phone call info, etc.
  recordedAt: Date;
  recordedById: string | null;
}
```

> **DB mapping note:** The `metadata` field maps to the existing `video_summary` JSONB column in the database. The column name is a v1 legacy — it already stores diagnosis details, phone call info, and other metadata (not just video summaries). The repository implementation handles this mapping: `entity.metadata ↔ row.videoSummary`. No DB migration needed for this field.

### 2.2 Value Objects

```typescript
class CaseNumber {
  constructor(readonly value: string) {
    if (!/^CASE-\d{4}-\d{4,}$/.test(value)) {
      throw new ValidationError('Invalid case number format');
    }
  }
  static generate(year: number, sequence: number): CaseNumber {
    return new CaseNumber(`CASE-${year}-${String(sequence).padStart(4, '0')}`);
  }
}
```

### 2.3 Enums

```typescript
type CaseStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
type CaseStage = 'PENDING_ASSIGNMENT' | 'TRANSFERRED_TO_HOSPITAL' | 'HOSPITAL_CONTACTED'
  | 'CONSULTATION_SCHEDULED' | 'IN_TREATMENT' | 'TREATMENT_COMPLETED';
type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
type DocumentType = 'LAB' | 'IMAGING' | 'DISCHARGE' | 'PRESCRIPTION' | 'ID'
  | 'DIAGNOSIS' | 'QUOTE' | 'INVITATION' | 'OTHER';
type Sensitivity = 'PHI_HIGH' | 'PHI_MED' | 'PHI_LOW';
type DocumentStatus = 'PENDING' | 'ACTIVE' | 'DELETED';
type ProgressType = 'STATUS_CHANGE' | 'DOCUMENT_UPLOAD' | 'VIDEO_CONSULTATION'
  | 'MESSAGE' | 'APPOINTMENT';
```

### 2.4 State Machine

#### Status Transitions

```typescript
const STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT:     ['ACTIVE', 'CANCELLED'],
  ACTIVE:    ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED:  [],  // terminal state
};
```

`Case.transitionStatus(to)` throws `ValidationError` if transition is invalid.

#### Stage Progression

```typescript
const STAGE_ORDER: CaseStage[] = [
  'PENDING_ASSIGNMENT',
  'TRANSFERRED_TO_HOSPITAL',
  'HOSPITAL_CONTACTED',
  'CONSULTATION_SCHEDULED',
  'IN_TREATMENT',
  'TREATMENT_COMPLETED',
];
```

`Case.advanceStage(to)` only allows forward movement (index must increase). Throws `ValidationError` on backward transition.

#### Assignment Rules

`Case.assign(hospitalId)`:
- Sets `assignedHospitalId`, `assignedAt = now()`
- Automatically advances stage to `TRANSFERRED_TO_HOSPITAL` if currently `PENDING_ASSIGNMENT`

### 2.5 Repository Ports (Interfaces)

```typescript
interface ICaseRepository {
  findById(id: string): Promise<Case | null>;
  findMany(query: CaseListQuery, hospitalId?: string): Promise<PaginatedResult<Case>>;
  save(entity: Case): Promise<Case>;
  nextCaseNumber(): Promise<CaseNumber>;
  countByFilters(filters: CaseCountFilters): Promise<CaseStats>;
}

interface IDocumentRepository {
  findById(id: string): Promise<Document | null>;
  findByCaseId(caseId: string): Promise<Document[]>;
  save(doc: Document): Promise<Document>;
  softDelete(id: string): Promise<void>;
}

interface ICaseProgressRepository {
  findByCaseId(caseId: string): Promise<CaseProgress[]>;
  save(progress: CaseProgress): Promise<CaseProgress>;
}

interface IHospitalRepository {
  findById(id: string): Promise<{ id: string; name: string; status: string } | null>;
}
```

### 2.6 Storage Port

```typescript
interface IStorageService {
  createPresignedUpload(key: string, contentType: string): Promise<{ url: string; key: string }>;
  getSignedUrl(key: string): Promise<string>;
  getSignedUrls(keys: string[]): Promise<Record<string, string>>;
}
```

### 2.7 Domain Services

```typescript
class CaseAssignmentService {
  validateAssignment(caze: Case, hospitalId: string, hospitalStatus: string): void;
  // Rules:
  // - Hospital must be ACTIVE (not PENDING or INACTIVE)
  // - Case stage must be PENDING_ASSIGNMENT or case must be unassigned
}
```

### 2.8 Directory Structure

```
packages/domain/
  src/
    entities/
      case.entity.ts
      document.entity.ts
      case-progress.entity.ts
    value-objects/
      case-number.ts
    enums/
      index.ts
    state-machine/
      case-status-transitions.ts
      case-stage-order.ts
    ports/
      case-repository.port.ts
      document-repository.port.ts
      case-progress-repository.port.ts
      hospital-repository.port.ts
      storage-service.port.ts
    services/
      case-assignment.service.ts
    index.ts
  __tests__/
    case.entity.test.ts
    case-number.test.ts
    case-assignment.service.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## 3. Application Layer (`packages/application/`)

Depends on `@medical-crm/domain` (ports + entities). No infrastructure dependency. Concrete implementations injected via composition root.

### 3.1 Actor Model

```typescript
interface Actor {
  userId: string;
  email: string;
  role: 'ADMIN' | 'HOSPITAL' | 'PATIENT';  // single effective role
  hospitalId: string | null;
}
```

**Derivation from Session:** The existing Keycloak auth middleware provides `Session.roles: string[]` (array). A `toActor(session: Session): Actor` mapping function selects a single effective role using priority order: `ADMIN > HOSPITAL > PATIENT`. This function lives in `packages/application/src/types/actor.ts`.

```typescript
const ROLE_PRIORITY: string[] = ['ADMIN', 'HOSPITAL', 'PATIENT'];

function toActor(session: Session): Actor {
  const role = ROLE_PRIORITY.find(r => session.roles.includes(r)) ?? 'PATIENT';
  return {
    userId: session.userId,
    email: session.email,
    role: role as Actor['role'],
    hospitalId: session.hospitalId,
  };
}
```

The route handler calls `toActor(c.get('session'))` before passing to use cases.

### 3.2 Use Cases

#### Case Use Cases

| Use Case | Constructor Dependencies | Description |
|----------|------------------------|-------------|
| `CreateCaseUseCase` | `ICaseRepository` | Generate CaseNumber, create with DRAFT/PENDING_ASSIGNMENT, save |
| `ListCasesUseCase` | `ICaseRepository` | Hospital role: force filter by `actor.hospitalId`. Admin: no filter |
| `GetCaseUseCase` | `ICaseRepository` | Basic case detail. Hospital: verify case belongs to their hospital |
| `GetHospitalCaseDetailUseCase` | `ICaseRepository`, `ICaseProgressRepository`, `IDocumentRepository`, `IStorageService` | Aggregated view: case + progress split into diagnoses/phoneCalls/consultations + documents with signed URLs |
| `UpdateCaseUseCase` | `ICaseRepository` | Partial update of basic fields (primaryDiagnosis, symptoms, medicalHistory, patientCountry, patientLanguage). Hospital: verify case ownership |
| `AssignCaseUseCase` | `ICaseRepository`, `IHospitalRepository`, `CaseAssignmentService` | Fetch hospital to verify ACTIVE status, call `case.assign()`, save |
| `UpdateCaseStatusUseCase` | `ICaseRepository`, `ICaseProgressRepository` | Call `case.transitionStatus()`, auto-create STATUS_CHANGE progress entry |
| `AdvanceCaseStageUseCase` | `ICaseRepository`, `ICaseProgressRepository` | Call `case.advanceStage()`, auto-create STATUS_CHANGE progress entry |
| `GetCaseStatsUseCase` | `ICaseRepository` | Dashboard stats: total, unassigned, active, completed, cancelled |

#### Document Use Cases

| Use Case | Constructor Dependencies | Description |
|----------|------------------------|-------------|
| `UploadDocumentUseCase` | `IDocumentRepository`, `ICaseRepository`, `ICaseProgressRepository`, `IStorageService` | Generate presigned upload URL, save document metadata, create DOCUMENT_UPLOAD progress entry |
| `ListDocumentsUseCase` | `IDocumentRepository`, `IStorageService` | List documents for a case, include signed download URLs |
| `DeleteDocumentUseCase` | `IDocumentRepository` | Soft delete (status → DELETED) |

#### Progress Use Cases

| Use Case | Constructor Dependencies | Description |
|----------|------------------------|-------------|
| `GetCaseProgressUseCase` | `ICaseProgressRepository` | List progress entries ordered by recordedAt DESC |
| `AddCaseProgressUseCase` | `ICaseProgressRepository`, `ICaseRepository` | Add progress entry (diagnosis, phone call, status change, etc.) |

### 3.3 DTOs

#### Input DTOs

```typescript
interface CreateCaseInput {
  patientId: string;             // existing user ID (admin selects from patient list)
  patientName: string;
  patientCountry?: string;
  patientLanguage?: string;      // default "en"
  primaryDiagnosis?: string;
  symptoms?: string[];
  medicalHistory?: string;
}
// Note: patientId is a required FK to the users table. The admin selects an
// existing patient when creating a case. Patient user creation is a separate
// flow handled by Keycloak registration, outside Phase 2A scope.

interface UploadDocumentInput {
  caseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: DocumentType;
  sensitivity: Sensitivity;
  language: string;
}
// Storage key generated by UploadDocumentUseCase: `documents/{caseId}/{uuid}/{fileName}`
// UUID ensures uniqueness; caseId prefix enables per-case listing in storage.

// Discriminated union for different progress types.
// Maps to ProgressType enum: DIAGNOSIS → STATUS_CHANGE, PHONE_CALL → APPOINTMENT.
// VIDEO_CONSULTATION and MESSAGE progress entries are auto-created by Phase 2B/2C systems.
type AddProgressInput =
  | { type: 'DIAGNOSIS'; caseId: string; icdCode?: string; severity?: string;
      treatmentRecommendation?: string; suggestedTests?: string;
      costEstimate?: string; treatmentDuration?: string; }
  | { type: 'PHONE_CALL'; caseId: string; callResult?: string;
      summary?: string; duration?: number; nextFollowUp?: string; }
  | { type: 'STATUS_CHANGE'; caseId: string; reason?: string; }
  | { type: 'DOCUMENT_UPLOAD'; caseId: string; documentId: string; };
// AddCaseProgressUseCase maps input types to ProgressType + stores typed data in metadata:
// - DIAGNOSIS → progressType: STATUS_CHANGE, metadata: { kind: 'diagnosis', icdCode, ... }
// - PHONE_CALL → progressType: APPOINTMENT, metadata: { kind: 'phone_call', callResult, ... }
// - STATUS_CHANGE → progressType: STATUS_CHANGE, metadata: { kind: 'status_change', reason }
// - DOCUMENT_UPLOAD → progressType: DOCUMENT_UPLOAD, metadata: { documentId }
```

#### Output DTOs

```typescript
interface CaseDTO {
  id: string;
  caseNumber: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  assignedHospitalId: string | null;
  hospitalName: string | null;
  primaryDiagnosis: string | null;
  status: string;
  stage: string;
  riskLevel: string | null;
  aiSummary: string | null;
  assignedAt: string | null;      // ISO 8601
  createdAt: string;
  updatedAt: string;
}

interface HospitalCaseDetailDTO {
  id: string;
  caseNumber: string;
  displayStatus: string;           // derived from CaseStage for hospital UI compatibility:
                                   // PENDING_ASSIGNMENT/TRANSFERRED_TO_HOSPITAL → "transferred"
                                   // HOSPITAL_CONTACTED → "contacted"
                                   // CONSULTATION_SCHEDULED → "consultation_scheduled"
                                   // IN_TREATMENT → "in_treatment"
                                   // TREATMENT_COMPLETED → "completed"
  patient: {
    id: string;
    name: string;
    code: string;                  // from users.patient_code column in DB
    country: string | null;
    language: string;
  };
  medicalCondition: {
    primaryDiagnosis: string | null;
    diagnosisCode: string | null;
    symptoms: string[] | null;
    medicalHistory: string | null;
  };
  aiSummary: string | null;
  riskLevel: string | null;
  diagnoses: DiagnosisDTO[];       // extracted from progress
  phoneCalls: PhoneCallDTO[];      // extracted from progress
  consultationHistory: ConsultationHistoryDTO[];  // extracted from progress
  documents: DocumentWithUrlDTO[];
  totalMessages: number;           // hardcoded to 0 until Phase 2B (messages)
  createdAt: string;
  updatedAt: string;
}

interface DocumentDTO {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  sensitivity: string;
  language: string;
  isTranslated: boolean;
  downloadUrl: string;             // signed URL
  createdAt: string;
}

interface CaseProgressDTO {
  id: string;
  title: string;
  description: string | null;
  progressType: string;
  metadata: Record<string, unknown> | null;
  recordedAt: string;
  recordedById: string | null;
}

interface CaseStats {
  total: number;
  unassigned: number;
  active: number;
  completed: number;
  cancelled: number;
}
```

### 3.4 Mappers

```typescript
function toCaseDTO(entity: Case, hospitalName?: string): CaseDTO;
function toHospitalCaseDetailDTO(
  entity: Case,
  progress: CaseProgress[],
  documents: Document[],
  signedUrls: Record<string, string>,
): HospitalCaseDetailDTO;
function toDocumentDTO(entity: Document, signedUrl: string): DocumentDTO;
function toProgressDTO(entity: CaseProgress): CaseProgressDTO;
```

### 3.5 Directory Structure

```
packages/application/
  src/
    use-cases/
      cases/
        create-case.use-case.ts
        list-cases.use-case.ts
        get-case.use-case.ts
        get-hospital-case-detail.use-case.ts
        update-case.use-case.ts
        assign-case.use-case.ts
        update-case-status.use-case.ts
        advance-case-stage.use-case.ts
        get-case-stats.use-case.ts
      documents/
        upload-document.use-case.ts
        list-documents.use-case.ts
        delete-document.use-case.ts
      progress/
        get-case-progress.use-case.ts
        add-case-progress.use-case.ts
    dtos/
      case.dto.ts
      document.dto.ts
      progress.dto.ts
    mappers/
      case.mapper.ts
      document.mapper.ts
      progress.mapper.ts
    types/
      actor.ts
    index.ts
  __tests__/
    create-case.use-case.test.ts
    list-cases.use-case.test.ts
    get-case.use-case.test.ts
    get-hospital-case-detail.use-case.test.ts
    assign-case.use-case.test.ts
    update-case-status.use-case.test.ts
    upload-document.use-case.test.ts
    add-case-progress.use-case.test.ts
  package.json
  tsconfig.json
  vitest.config.ts
```

---

## 4. Infrastructure Layer Extensions

### 4.1 Repository Implementations (Drizzle)

```
packages/infrastructure/
  database/
    repositories/
      drizzle-case.repository.ts
      drizzle-document.repository.ts
      drizzle-case-progress.repository.ts
      drizzle-hospital.repository.ts
  storage/
    supabase-storage.adapter.ts
```

#### DrizzleCaseRepository

Key implementation details:

- `findMany`: Composes WHERE from optional status, stage, hospitalId, search (ilike on patientName, caseNumber, primaryDiagnosis). Offset pagination with COUNT.
- `save`: Upsert via `onConflictDoUpdate` on `id`. Auto-sets `updatedAt`.
- `nextCaseNumber`: `SELECT MAX(case_number) FROM cases WHERE case_number LIKE 'CASE-{year}-%'`, parse sequence + 1. Uses optimistic retry: on unique constraint violation (`cases_case_number_key`), re-fetch MAX and retry (up to 3 attempts). This handles concurrent case creation without requiring advisory locks.
- `countByFilters`: Single query with `COUNT(*) FILTER (WHERE ...)` for all stats.

#### DrizzleDocumentRepository

- `findByCaseId`: `WHERE case_id = ? AND status != 'DELETED'`, ORDER BY `created_at DESC`.
- `softDelete`: `UPDATE SET status = 'DELETED', updated_at = now()`.

#### DrizzleCaseProgressRepository

- `findByCaseId`: ORDER BY `recorded_at DESC`.
- `save`: Simple INSERT.

#### SupabaseStorageAdapter

- `createPresignedUpload`: `supabase.storage.from('documents').createSignedUploadUrl(key)`.
- `getSignedUrl`: `supabase.storage.from('documents').createSignedUrl(key, expiresIn)`.
- `getSignedUrls`: `supabase.storage.from('documents').createSignedUrls(keys, expiresIn)`.

### 4.2 DB Migration

Single migration for AI summary column consolidation:

```sql
-- Add new columns
ALTER TABLE cases ADD COLUMN ai_summary TEXT;
ALTER TABLE cases ADD COLUMN ai_summary_language VARCHAR(10);

-- Migrate existing data (prefer Chinese, fall back to English)
UPDATE cases
SET ai_summary = COALESCE(ai_summary_zh, ai_summary_en),
    ai_summary_language = CASE
      WHEN ai_summary_zh IS NOT NULL THEN 'zh'
      WHEN ai_summary_en IS NOT NULL THEN 'en'
      ELSE NULL
    END
WHERE ai_summary_zh IS NOT NULL OR ai_summary_en IS NOT NULL;

-- Keep old columns for now (drop in future phase after verification)
```

After migration: run `drizzle-kit pull` to re-introspect, then manually verify the updated `schema.ts`.

---

## 5. API Routes (Hono + @hono/zod-openapi)

### 5.1 Route Structure

```
apps/api/src/
  routes/
    cases.routes.ts
    documents.routes.ts
    progress.routes.ts
    index.ts                 ← mount all to /api/v2/
  composition-root.ts        ← extended with repos + use cases
```

### 5.2 Endpoints

All under `/api/v2/`, require auth middleware. Role enforcement in use case layer.

#### Cases

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/api/v2/cases` | ADMIN | Create case |
| `GET` | `/api/v2/cases` | ADMIN, HOSPITAL | List cases (hospital auto-filtered) |
| `GET` | `/api/v2/cases/stats` | ADMIN, HOSPITAL | Dashboard statistics |
| `GET` | `/api/v2/cases/:id` | ADMIN, HOSPITAL | Case detail (hospital gets aggregated view) |
| `PATCH` | `/api/v2/cases/:id` | ADMIN, HOSPITAL | Update basic case fields (diagnosis, symptoms, etc.) |
| `PATCH` | `/api/v2/cases/:id/status` | ADMIN, HOSPITAL | Update case status |
| `PATCH` | `/api/v2/cases/:id/stage` | ADMIN, HOSPITAL | Advance case stage |
| `POST` | `/api/v2/cases/:id/assign` | ADMIN | Assign case to hospital |

#### Documents

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `POST` | `/api/v2/cases/:caseId/documents` | ADMIN, HOSPITAL | Upload document (returns presigned URL + metadata) |
| `GET` | `/api/v2/cases/:caseId/documents` | ADMIN, HOSPITAL | List documents with signed download URLs |
| `DELETE` | `/api/v2/cases/:caseId/documents/:docId` | ADMIN, HOSPITAL | Soft delete document |

#### Progress

| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| `GET` | `/api/v2/cases/:caseId/progress` | ADMIN, HOSPITAL | Progress history |
| `POST` | `/api/v2/cases/:caseId/progress` | HOSPITAL | Add progress (diagnosis, phone call, etc.) |

### 5.3 Route Handler Pattern

```typescript
// Example: cases.routes.ts
const listCasesRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases',
  request: { query: caseListQuerySchema },
  responses: {
    200: { content: { 'application/json': { schema: paginatedCaseSchema } } },
  },
});

app.openapi(listCasesRoute, async (c) => {
  const query = c.req.valid('query');
  const actor = c.get('session');
  const result = await getServices().listCases.execute(query, actor);
  return c.json(result, 200);
});
```

### 5.4 Composition Root Extension

The existing `getInfrastructure()` function is renamed to `getServices()` and expanded. The `Infrastructure` interface becomes `AppServices`. This is a breaking change to the composition root — the health route and any future consumers must update their import.

**New dependency:** `@hono/zod-openapi` must be added to `apps/api/package.json`.

```typescript
interface AppServices {
  // infrastructure (existing, migrated from Infrastructure interface)
  crmDb: CrmDatabase;
  mainSupabase: SupabaseClient;
  chinaSupabase: SupabaseClient;

  // repositories (new)
  caseRepo: ICaseRepository;
  documentRepo: IDocumentRepository;
  progressRepo: ICaseProgressRepository;
  hospitalRepo: IHospitalRepository;
  storage: IStorageService;

  // use cases (new)
  createCase: CreateCaseUseCase;
  listCases: ListCasesUseCase;
  getCase: GetCaseUseCase;
  getHospitalCaseDetail: GetHospitalCaseDetailUseCase;
  updateCase: UpdateCaseUseCase;
  assignCase: AssignCaseUseCase;
  updateCaseStatus: UpdateCaseStatusUseCase;
  advanceCaseStage: AdvanceCaseStageUseCase;
  getCaseStats: GetCaseStatsUseCase;
  uploadDocument: UploadDocumentUseCase;
  listDocuments: ListDocumentsUseCase;
  deleteDocument: DeleteDocumentUseCase;
  getCaseProgress: GetCaseProgressUseCase;
  addCaseProgress: AddCaseProgressUseCase;
}
```

---

## 6. Testing Strategy

### 6.1 Test Distribution

| Layer | Location | Type | What It Tests |
|-------|----------|------|---------------|
| Domain | `packages/domain/__tests__/` | Unit (no mocks) | Entity methods, state machine, value objects, domain services |
| Application | `packages/application/__tests__/` | Unit (mock repos) | Use case orchestration, permission logic, DTO mapping |
| Infrastructure | `packages/infrastructure/__tests__/integration/` | Integration (real DB) | SQL correctness, hospital isolation, aggregation, soft delete |
| API Routes | `apps/api/__tests__/` | Unit (mock use cases) | HTTP status codes, Zod validation, serialization |

### 6.2 Integration Test Critical Paths

These tests connect to the real CRM database (dev environment):

| Test | Validates |
|------|-----------|
| `findMany` + hospital isolation | Hospital user only sees their assigned cases, no data leakage |
| `findMany` + search | `ilike` on patientName/caseNumber/primaryDiagnosis works correctly |
| `countByFilters` | SQL `FILTER (WHERE ...)` aggregation returns correct counts |
| `nextCaseNumber` | Sequence increments correctly, handles cross-year boundary |
| `save` (insert + update) | Upsert works, `updatedAt` auto-updates |
| `softDelete` | Status changes to DELETED, record not physically removed |
| `findByCaseId` (documents) | Excludes DELETED documents |
| `findByCaseId` (progress) | ORDER BY `recorded_at DESC` is correct |

### 6.3 Integration Test Setup

```typescript
// vitest.integration.config.ts — separate config
// Each test runs inside a database transaction that is ROLLED BACK after the test.
// This ensures zero side effects on the dev database and prevents data interference
// between concurrent test runs.
//
// setup: getCrmDb() connection + begin transaction
// afterEach: ROLLBACK transaction (all test data discarded)
// teardown: close DB connection
//
// For tests that need committed data (e.g., testing unique constraints across
// transactions), use a TEST- prefixed case number and explicit cleanup.
```

Turbo task: `test:integration` (no cache, depends on build).

### 6.4 Estimated Test Counts

| Layer | Files | Cases |
|-------|-------|-------|
| Domain (unit) | 3 | ~25 |
| Application (unit) | 8 | ~35 |
| Infrastructure (integration) | 3 | ~20 |
| API Routes (unit) | 3 | ~20 |
| **Total** | **17** | **~100** |

---

## 7. Data Flow Summary

```
HTTP Request
  → Hono Route Handler (validate input via Zod)
    → Use Case (business orchestration + permission check)
      → Domain Entity (state machine + invariants)
      → Repository Port ← Drizzle Implementation (SQL)
      → Storage Port ← Supabase Implementation (signed URLs)
    → Mapper (entity → DTO)
  → HTTP Response (JSON)
```

### Permission Flow

```
Auth Middleware → extracts Actor { userId, role, hospitalId }
  → Use Case receives Actor
    → role === 'HOSPITAL' → force filter by actor.hospitalId
    → role === 'ADMIN' → no filter restriction
    → verify case ownership before mutations
```

---

## 8. File Changes Summary

### New Packages

| Package | Purpose |
|---------|---------|
| `packages/domain/` | Entities, value objects, ports, domain services |
| `packages/application/` | Use cases, DTOs, mappers |

### Modified Packages

| Package | Changes |
|---------|---------|
| `packages/infrastructure/` | Add `database/repositories/`, `storage/` |
| `packages/shared/validation/` | Extend Zod schemas for new API inputs |
| `apps/api/` | Add routes, extend composition root |

### DB Migration

| Change | Details |
|--------|---------|
| Add `ai_summary` column | TEXT, nullable |
| Add `ai_summary_language` column | VARCHAR(10), nullable |
| Migrate data from `ai_summary_zh`/`ai_summary_en` | COALESCE, prefer zh |
| Keep old columns | Drop in future phase |
