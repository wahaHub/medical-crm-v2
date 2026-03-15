# Phase 2A: Domain Layer + Case CRUD Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Case CRUD, Document management, and CaseProgress tracking with a Rich Domain Model, use case layer, Drizzle repositories, and Hono API routes.

**Architecture:** Clean Architecture with strict dependency boundaries (domain → application → infrastructure). New `packages/domain/` and `packages/application/` packages. Infrastructure repos extend `packages/infrastructure/`. API routes added to `apps/api/`. All business rules in domain entities; orchestration in use cases; SQL in Drizzle repositories.

**Tech Stack:** TypeScript 5.7, Drizzle ORM 0.45.1, Hono 4.7 + @hono/zod-openapi, Vitest 3.0, Zod, Supabase storage, pnpm workspaces + Turbo.

**Spec:** `docs/superpowers/specs/2026-03-14-phase2a-domain-case-crud-design.md`

---

## File Structure

### New Packages

```
packages/domain/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                              ← barrel export
    enums/index.ts                        ← CaseStatus, CaseStage, RiskLevel, DocumentType, etc.
    value-objects/case-number.ts           ← CaseNumber VO with validation + generate
    entities/case.entity.ts               ← Case aggregate root + state machine + assign
    entities/document.entity.ts           ← Document entity
    entities/case-progress.entity.ts      ← CaseProgress entity
    state-machine/case-status-transitions.ts ← STATUS_TRANSITIONS map
    state-machine/case-stage-order.ts     ← STAGE_ORDER array
    ports/case-repository.port.ts         ← ICaseRepository
    ports/document-repository.port.ts     ← IDocumentRepository
    ports/case-progress-repository.port.ts ← ICaseProgressRepository
    ports/hospital-repository.port.ts     ← IHospitalRepository
    ports/patient-repository.port.ts      ← IPatientRepository (spec errata: needed for patient.code in HospitalCaseDetailDTO)
    ports/storage-service.port.ts         ← IStorageService + PresignedUploadResult
    services/case-assignment.service.ts   ← CaseAssignmentService
  __tests__/
    case-number.test.ts
    case.entity.test.ts
    case-assignment.service.test.ts

packages/application/
  package.json
  tsconfig.json
  vitest.config.ts
  src/
    index.ts                              ← barrel export
    types/actor.ts                        ← Actor interface + toActor() + ROLE_PRIORITY
    dtos/case.dto.ts                      ← CaseDTO, HospitalCaseDetailDTO, CaseStats
    dtos/document.dto.ts                  ← DocumentDTO, DocumentWithUrlDTO
    dtos/progress.dto.ts                  ← CaseProgressDTO, DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO
    mappers/case.mapper.ts                ← toCaseDTO, toHospitalCaseDetailDTO
    mappers/document.mapper.ts            ← toDocumentDTO
    mappers/progress.mapper.ts            ← toProgressDTO, splitProgressByType
    use-cases/cases/create-case.use-case.ts
    use-cases/cases/list-cases.use-case.ts
    use-cases/cases/get-case.use-case.ts
    use-cases/cases/get-hospital-case-detail.use-case.ts
    use-cases/cases/update-case.use-case.ts
    use-cases/cases/assign-case.use-case.ts
    use-cases/cases/update-case-status.use-case.ts
    use-cases/cases/advance-case-stage.use-case.ts
    use-cases/cases/get-case-stats.use-case.ts
    use-cases/documents/upload-document.use-case.ts
    use-cases/documents/list-documents.use-case.ts
    use-cases/documents/delete-document.use-case.ts
    use-cases/progress/get-case-progress.use-case.ts
    use-cases/progress/add-case-progress.use-case.ts
  __tests__/
    create-case.use-case.test.ts
    list-cases.use-case.test.ts
    get-case.use-case.test.ts
    get-hospital-case-detail.use-case.test.ts
    assign-case.use-case.test.ts
    update-case-status.use-case.test.ts
    upload-document.use-case.test.ts
    add-case-progress.use-case.test.ts
```

### Modified Packages

```
packages/infrastructure/
  database/repositories/
    drizzle-case.repository.ts            ← NEW: ICaseRepository impl
    drizzle-document.repository.ts        ← NEW: IDocumentRepository impl
    drizzle-case-progress.repository.ts   ← NEW: ICaseProgressRepository impl
    drizzle-hospital.repository.ts        ← NEW: IHospitalRepository impl
    drizzle-patient.repository.ts         ← NEW: IPatientRepository impl
  storage/
    supabase-storage.adapter.ts           ← NEW: IStorageService impl
  __tests__/
    integration/
      drizzle-case.repository.test.ts     ← NEW
      drizzle-document.repository.test.ts ← NEW
      drizzle-progress.repository.test.ts ← NEW
  package.json                            ← MODIFY: add exports + domain dep

packages/shared/validation/
  src/case.schema.ts                      ← MODIFY: add create/update/assign/status/stage schemas
  src/document.schema.ts                  ← NEW: upload document schema
  src/progress.schema.ts                  ← NEW: add progress schema

apps/api/
  src/index.ts                            ← MODIFY: mount v2 routes
  src/composition-root.ts                 ← MODIFY: getInfrastructure → getServices
  src/routes/
    cases.routes.ts                       ← NEW: 8 case endpoints
    documents.routes.ts                   ← NEW: 3 document endpoints
    progress.routes.ts                    ← NEW: 2 progress endpoints
    index.ts                              ← NEW: mount all routes
  __tests__/
    cases.routes.test.ts                  ← NEW
    documents.routes.test.ts              ← NEW
    progress.routes.test.ts               ← NEW
  package.json                            ← MODIFY: add @hono/zod-openapi dep

migrations/
  001-ai-summary-columns.sql              ← NEW: ai_summary migration
```

### Dependency Chain (determines task ordering)

```
Chunk 1: Domain Layer (no deps, pure TypeScript)
  ↓
Chunk 2: Application Layer (depends on domain)  ←── can parallel with ↓
Chunk 3: Infrastructure Layer (depends on domain)
  ↓
Chunk 4: API Routes & Wiring (depends on application + infrastructure)
```

---

## Chunk 1: Domain Layer

### Task 1: Scaffold domain package + enums + state machine constants

**Files:**
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `packages/domain/vitest.config.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/src/enums/index.ts`
- Create: `packages/domain/src/state-machine/case-status-transitions.ts`
- Create: `packages/domain/src/state-machine/case-stage-order.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@medical-crm/domain",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@medical-crm/utils": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create enums**

File: `packages/domain/src/enums/index.ts`

```typescript
export type CaseStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
export type CaseStage =
  | 'PENDING_ASSIGNMENT'
  | 'TRANSFERRED_TO_HOSPITAL'
  | 'HOSPITAL_CONTACTED'
  | 'CONSULTATION_SCHEDULED'
  | 'IN_TREATMENT'
  | 'TREATMENT_COMPLETED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type DocumentType =
  | 'LAB' | 'IMAGING' | 'DISCHARGE' | 'PRESCRIPTION'
  | 'ID' | 'DIAGNOSIS' | 'QUOTE' | 'INVITATION' | 'OTHER';
export type Sensitivity = 'PHI_HIGH' | 'PHI_MED' | 'PHI_LOW';
export type DocumentStatus = 'PENDING' | 'ACTIVE' | 'DELETED';
export type ProgressType =
  | 'STATUS_CHANGE' | 'DOCUMENT_UPLOAD' | 'VIDEO_CONSULTATION'
  | 'MESSAGE' | 'APPOINTMENT';
```

- [ ] **Step 5: Create state machine constants**

File: `packages/domain/src/state-machine/case-status-transitions.ts`

```typescript
import type { CaseStatus } from '../enums/index.js';

export const STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};
```

File: `packages/domain/src/state-machine/case-stage-order.ts`

```typescript
import type { CaseStage } from '../enums/index.js';

export const STAGE_ORDER: CaseStage[] = [
  'PENDING_ASSIGNMENT',
  'TRANSFERRED_TO_HOSPITAL',
  'HOSPITAL_CONTACTED',
  'CONSULTATION_SCHEDULED',
  'IN_TREATMENT',
  'TREATMENT_COMPLETED',
];
```

- [ ] **Step 6: Create barrel export (empty for now)**

File: `packages/domain/src/index.ts`

```typescript
// Enums
export type {
  CaseStatus, CaseStage, RiskLevel, DocumentType,
  Sensitivity, DocumentStatus, ProgressType,
} from './enums/index.js';

// State machine
export { STATUS_TRANSITIONS } from './state-machine/case-status-transitions.js';
export { STAGE_ORDER } from './state-machine/case-stage-order.js';
```

- [ ] **Step 7: Install dependencies and verify**

```bash
cd /path/to/medical-crm-v2
pnpm install
pnpm --filter @medical-crm/domain typecheck
```

Expected: passes with no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/
git commit -m "feat(domain): scaffold domain package with enums and state machine constants"
```

---

### Task 2: CaseNumber value object (TDD)

**Files:**
- Create: `packages/domain/src/value-objects/case-number.ts`
- Create: `packages/domain/__tests__/case-number.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing tests**

File: `packages/domain/__tests__/case-number.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { CaseNumber } from '../src/value-objects/case-number.js';

describe('CaseNumber', () => {
  it('accepts valid format CASE-YYYY-NNNN', () => {
    const cn = new CaseNumber('CASE-2026-0001');
    expect(cn.value).toBe('CASE-2026-0001');
  });

  it('accepts longer sequences CASE-2026-12345', () => {
    const cn = new CaseNumber('CASE-2026-12345');
    expect(cn.value).toBe('CASE-2026-12345');
  });

  it('throws on invalid format', () => {
    expect(() => new CaseNumber('INVALID')).toThrow('Invalid case number format');
    expect(() => new CaseNumber('CASE-26-001')).toThrow('Invalid case number format');
    expect(() => new CaseNumber('CASE-2026-01')).toThrow('Invalid case number format');
    expect(() => new CaseNumber('')).toThrow('Invalid case number format');
  });

  it('generates with correct format', () => {
    const cn = CaseNumber.generate(2026, 1);
    expect(cn.value).toBe('CASE-2026-0001');
  });

  it('generates with large sequence numbers', () => {
    const cn = CaseNumber.generate(2026, 99999);
    expect(cn.value).toBe('CASE-2026-99999');
  });

  it('pads sequence to minimum 4 digits', () => {
    const cn = CaseNumber.generate(2026, 42);
    expect(cn.value).toBe('CASE-2026-0042');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @medical-crm/domain test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement CaseNumber**

File: `packages/domain/src/value-objects/case-number.ts`

```typescript
import { ValidationError } from '@medical-crm/utils';

const CASE_NUMBER_REGEX = /^CASE-\d{4}-\d{4,}$/;

export class CaseNumber {
  constructor(readonly value: string) {
    if (!CASE_NUMBER_REGEX.test(value)) {
      throw new ValidationError('Invalid case number format');
    }
  }

  static generate(year: number, sequence: number): CaseNumber {
    return new CaseNumber(`CASE-${year}-${String(sequence).padStart(4, '0')}`);
  }
}
```

- [ ] **Step 4: Add to barrel export**

Add to `packages/domain/src/index.ts`:

```typescript
export { CaseNumber } from './value-objects/case-number.js';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm --filter @medical-crm/domain test
```

Expected: all 6 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/
git commit -m "feat(domain): add CaseNumber value object with validation"
```

---

### Task 3: Case entity — constructor + basic fields (TDD)

**Files:**
- Create: `packages/domain/src/entities/case.entity.ts`
- Create: `packages/domain/__tests__/case.entity.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing tests for Case creation**

File: `packages/domain/__tests__/case.entity.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { Case } from '../src/entities/case.entity.js';
import { CaseNumber } from '../src/value-objects/case-number.js';

describe('Case entity', () => {
  function createTestCase(overrides: Partial<ConstructorParameters<typeof Case>[0]> = {}) {
    return new Case({
      id: 'case-1',
      caseNumber: new CaseNumber('CASE-2026-0001'),
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientCountry: 'US',
      patientLanguage: 'en',
      assignedHospitalId: null,
      primaryDiagnosis: null,
      diagnosisCode: null,
      symptoms: null,
      medicalHistory: null,
      aiSummary: null,
      aiSummaryLanguage: null,
      riskLevel: null,
      status: 'DRAFT',
      stage: 'PENDING_ASSIGNMENT',
      assignedAt: null,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
      ...overrides,
    });
  }

  describe('constructor', () => {
    it('creates a case with all fields', () => {
      const c = createTestCase();
      expect(c.id).toBe('case-1');
      expect(c.caseNumber.value).toBe('CASE-2026-0001');
      expect(c.patientId).toBe('patient-1');
      expect(c.patientName).toBe('John Doe');
      expect(c.status).toBe('DRAFT');
      expect(c.stage).toBe('PENDING_ASSIGNMENT');
    });
  });

  describe('setAiAnalysis', () => {
    it('sets all AI fields', () => {
      const c = createTestCase();
      c.setAiAnalysis('Summary text', 'zh', 'HIGH');
      expect(c.aiSummary).toBe('Summary text');
      expect(c.aiSummaryLanguage).toBe('zh');
      expect(c.riskLevel).toBe('HIGH');
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @medical-crm/domain test
```

- [ ] **Step 3: Implement Case entity (constructor + setAiAnalysis)**

File: `packages/domain/src/entities/case.entity.ts`

```typescript
import type { CaseStatus, CaseStage, RiskLevel } from '../enums/index.js';
import type { CaseNumber } from '../value-objects/case-number.js';
import { ValidationError } from '@medical-crm/utils';
import { STATUS_TRANSITIONS } from '../state-machine/case-status-transitions.js';
import { STAGE_ORDER } from '../state-machine/case-stage-order.js';

export interface CaseProps {
  id: string;
  caseNumber: CaseNumber;
  patientId: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  assignedHospitalId: string | null;
  primaryDiagnosis: string | null;
  diagnosisCode: string | null;
  symptoms: string[] | null;
  medicalHistory: string | null;
  aiSummary: string | null;
  aiSummaryLanguage: string | null;
  riskLevel: RiskLevel | null;
  status: CaseStatus;
  stage: CaseStage;
  assignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Case {
  readonly id: string;
  readonly caseNumber: CaseNumber;
  patientId: string;
  patientName: string;
  patientCountry: string | null;
  patientLanguage: string;
  assignedHospitalId: string | null;
  primaryDiagnosis: string | null;
  diagnosisCode: string | null;
  symptoms: string[] | null;
  medicalHistory: string | null;
  aiSummary: string | null;
  aiSummaryLanguage: string | null;
  riskLevel: RiskLevel | null;
  status: CaseStatus;
  stage: CaseStage;
  assignedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: CaseProps) {
    this.id = props.id;
    this.caseNumber = props.caseNumber;
    this.patientId = props.patientId;
    this.patientName = props.patientName;
    this.patientCountry = props.patientCountry;
    this.patientLanguage = props.patientLanguage;
    this.assignedHospitalId = props.assignedHospitalId;
    this.primaryDiagnosis = props.primaryDiagnosis;
    this.diagnosisCode = props.diagnosisCode;
    this.symptoms = props.symptoms;
    this.medicalHistory = props.medicalHistory;
    this.aiSummary = props.aiSummary;
    this.aiSummaryLanguage = props.aiSummaryLanguage;
    this.riskLevel = props.riskLevel;
    this.status = props.status;
    this.stage = props.stage;
    this.assignedAt = props.assignedAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  setAiAnalysis(summary: string, language: string, risk: RiskLevel): void {
    this.aiSummary = summary;
    this.aiSummaryLanguage = language;
    this.riskLevel = risk;
    this.updatedAt = new Date();
  }

  transitionStatus(to: CaseStatus): void {
    const allowed = STATUS_TRANSITIONS[this.status];
    if (!allowed.includes(to)) {
      throw new ValidationError(
        `Cannot transition case status from ${this.status} to ${to}`,
      );
    }
    this.status = to;
    this.updatedAt = new Date();
  }

  advanceStage(to: CaseStage): void {
    const currentIdx = STAGE_ORDER.indexOf(this.stage);
    const targetIdx = STAGE_ORDER.indexOf(to);
    if (targetIdx <= currentIdx) {
      throw new ValidationError(
        `Cannot move case stage backward from ${this.stage} to ${to}`,
      );
    }
    this.stage = to;
    this.updatedAt = new Date();
  }

  assign(hospitalId: string): void {
    this.assignedHospitalId = hospitalId;
    this.assignedAt = new Date();
    if (this.stage === 'PENDING_ASSIGNMENT') {
      this.stage = 'TRANSFERRED_TO_HOSPITAL';
    }
    this.updatedAt = new Date();
  }
}
```

- [ ] **Step 4: Add to barrel export**

Add to `packages/domain/src/index.ts`:

```typescript
export { Case } from './entities/case.entity.js';
export type { CaseProps } from './entities/case.entity.js';
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm --filter @medical-crm/domain test
```

- [ ] **Step 6: Commit**

```bash
git add packages/domain/
git commit -m "feat(domain): add Case entity with constructor and setAiAnalysis"
```

---

### Task 4: Case entity — state machine tests (TDD)

**Files:**
- Modify: `packages/domain/__tests__/case.entity.test.ts`

**Note:** The state machine implementation was included in Task 3. This task adds the tests.

- [ ] **Step 1: Add state machine tests to case.entity.test.ts**

Append the following `describe` blocks inside the root `describe('Case entity')`:

```typescript
  describe('transitionStatus', () => {
    it('allows DRAFT → ACTIVE', () => {
      const c = createTestCase({ status: 'DRAFT' });
      c.transitionStatus('ACTIVE');
      expect(c.status).toBe('ACTIVE');
    });

    it('allows DRAFT → CANCELLED', () => {
      const c = createTestCase({ status: 'DRAFT' });
      c.transitionStatus('CANCELLED');
      expect(c.status).toBe('CANCELLED');
    });

    it('allows ACTIVE → COMPLETED', () => {
      const c = createTestCase({ status: 'ACTIVE' });
      c.transitionStatus('COMPLETED');
      expect(c.status).toBe('COMPLETED');
    });

    it('allows ACTIVE → CANCELLED', () => {
      const c = createTestCase({ status: 'ACTIVE' });
      c.transitionStatus('CANCELLED');
      expect(c.status).toBe('CANCELLED');
    });

    it('allows COMPLETED → ARCHIVED', () => {
      const c = createTestCase({ status: 'COMPLETED' });
      c.transitionStatus('ARCHIVED');
      expect(c.status).toBe('ARCHIVED');
    });

    it('allows CANCELLED → ARCHIVED', () => {
      const c = createTestCase({ status: 'CANCELLED' });
      c.transitionStatus('ARCHIVED');
      expect(c.status).toBe('ARCHIVED');
    });

    it('throws on invalid DRAFT → COMPLETED', () => {
      const c = createTestCase({ status: 'DRAFT' });
      expect(() => c.transitionStatus('COMPLETED')).toThrow(
        'Cannot transition case status from DRAFT to COMPLETED',
      );
    });

    it('throws on ARCHIVED → any (terminal state)', () => {
      const c = createTestCase({ status: 'ARCHIVED' });
      expect(() => c.transitionStatus('ACTIVE')).toThrow();
    });

    it('updates updatedAt on transition', () => {
      const c = createTestCase({ status: 'DRAFT' });
      const before = c.updatedAt;
      c.transitionStatus('ACTIVE');
      expect(c.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('advanceStage', () => {
    it('allows forward movement PENDING_ASSIGNMENT → TRANSFERRED_TO_HOSPITAL', () => {
      const c = createTestCase({ stage: 'PENDING_ASSIGNMENT' });
      c.advanceStage('TRANSFERRED_TO_HOSPITAL');
      expect(c.stage).toBe('TRANSFERRED_TO_HOSPITAL');
    });

    it('allows skipping stages PENDING_ASSIGNMENT → CONSULTATION_SCHEDULED', () => {
      const c = createTestCase({ stage: 'PENDING_ASSIGNMENT' });
      c.advanceStage('CONSULTATION_SCHEDULED');
      expect(c.stage).toBe('CONSULTATION_SCHEDULED');
    });

    it('throws on backward movement', () => {
      const c = createTestCase({ stage: 'HOSPITAL_CONTACTED' });
      expect(() => c.advanceStage('TRANSFERRED_TO_HOSPITAL')).toThrow(
        'Cannot move case stage backward',
      );
    });

    it('throws on same stage (no-op)', () => {
      const c = createTestCase({ stage: 'IN_TREATMENT' });
      expect(() => c.advanceStage('IN_TREATMENT')).toThrow(
        'Cannot move case stage backward',
      );
    });
  });
```

- [ ] **Step 2: Run tests — expect all PASS**

```bash
pnpm --filter @medical-crm/domain test
```

Expected: all tests pass (constructor + setAiAnalysis + transitionStatus + advanceStage).

- [ ] **Step 3: Commit**

```bash
git add packages/domain/__tests__/
git commit -m "test(domain): add Case state machine transition tests"
```

---

### Task 5: Case entity — assignment tests (TDD)

**Files:**
- Modify: `packages/domain/__tests__/case.entity.test.ts`

- [ ] **Step 1: Add assignment tests**

Append inside `describe('Case entity')`:

```typescript
  describe('assign', () => {
    it('sets hospitalId and assignedAt', () => {
      const c = createTestCase({ assignedHospitalId: null, assignedAt: null });
      c.assign('hospital-1');
      expect(c.assignedHospitalId).toBe('hospital-1');
      expect(c.assignedAt).toBeInstanceOf(Date);
    });

    it('auto-advances stage from PENDING_ASSIGNMENT to TRANSFERRED_TO_HOSPITAL', () => {
      const c = createTestCase({ stage: 'PENDING_ASSIGNMENT' });
      c.assign('hospital-1');
      expect(c.stage).toBe('TRANSFERRED_TO_HOSPITAL');
    });

    it('does NOT change stage if already past PENDING_ASSIGNMENT', () => {
      const c = createTestCase({ stage: 'HOSPITAL_CONTACTED' });
      c.assign('hospital-2');
      expect(c.stage).toBe('HOSPITAL_CONTACTED');
      expect(c.assignedHospitalId).toBe('hospital-2');
    });
  });
```

- [ ] **Step 2: Run tests — expect PASS**

```bash
pnpm --filter @medical-crm/domain test
```

- [ ] **Step 3: Commit**

```bash
git add packages/domain/__tests__/
git commit -m "test(domain): add Case assignment tests"
```

---

### Task 6: Document + CaseProgress entities (TDD)

**Files:**
- Create: `packages/domain/src/entities/document.entity.ts`
- Create: `packages/domain/src/entities/case-progress.entity.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Implement Document entity**

File: `packages/domain/src/entities/document.entity.ts`

```typescript
import type { DocumentType, Sensitivity, DocumentStatus } from '../enums/index.js';

export interface DocumentProps {
  id: string;
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

export class Document {
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

  constructor(props: DocumentProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.uploadedById = props.uploadedById;
    this.fileName = props.fileName;
    this.fileSize = props.fileSize;
    this.mimeType = props.mimeType;
    this.storageKey = props.storageKey;
    this.documentType = props.documentType;
    this.sensitivity = props.sensitivity;
    this.language = props.language;
    this.isTranslated = props.isTranslated;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
```

- [ ] **Step 2: Implement CaseProgress entity**

File: `packages/domain/src/entities/case-progress.entity.ts`

```typescript
import type { ProgressType } from '../enums/index.js';

export interface CaseProgressProps {
  id: string;
  caseId: string;
  title: string;
  description: string | null;
  progressType: ProgressType;
  metadata: Record<string, unknown> | null;
  recordedAt: Date;
  recordedById: string | null;
}

export class CaseProgress {
  readonly id: string;
  caseId: string;
  title: string;
  description: string | null;
  progressType: ProgressType;
  metadata: Record<string, unknown> | null;
  recordedAt: Date;
  recordedById: string | null;

  constructor(props: CaseProgressProps) {
    this.id = props.id;
    this.caseId = props.caseId;
    this.title = props.title;
    this.description = props.description;
    this.progressType = props.progressType;
    this.metadata = props.metadata;
    this.recordedAt = props.recordedAt;
    this.recordedById = props.recordedById;
  }
}
```

- [ ] **Step 3: Add to barrel export**

Add to `packages/domain/src/index.ts`:

```typescript
export { Document } from './entities/document.entity.js';
export type { DocumentProps } from './entities/document.entity.js';
export { CaseProgress } from './entities/case-progress.entity.js';
export type { CaseProgressProps } from './entities/case-progress.entity.js';
```

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @medical-crm/domain typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/domain/
git commit -m "feat(domain): add Document and CaseProgress entities"
```

---

### Task 7: Repository ports + Storage port

**Files:**
- Create: `packages/domain/src/ports/case-repository.port.ts`
- Create: `packages/domain/src/ports/document-repository.port.ts`
- Create: `packages/domain/src/ports/case-progress-repository.port.ts`
- Create: `packages/domain/src/ports/hospital-repository.port.ts`
- Create: `packages/domain/src/ports/storage-service.port.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Create ICaseRepository port**

File: `packages/domain/src/ports/case-repository.port.ts`

```typescript
import type { Case } from '../entities/case.entity.js';
import type { CaseNumber } from '../value-objects/case-number.js';
import type { CaseStatus, CaseStage } from '../enums/index.js';
import type { PaginatedResult } from '@medical-crm/utils';

export interface CaseListQuery {
  page: number;
  limit: number;
  status?: CaseStatus;
  stage?: CaseStage;
  hospitalId?: string;
  search?: string;
}

export interface CaseCountFilters {
  hospitalId?: string;
}

export interface CaseStats {
  total: number;
  unassigned: number;
  active: number;
  completed: number;
  cancelled: number;
}

export interface ICaseRepository {
  findById(id: string): Promise<Case | null>;
  findMany(query: CaseListQuery, hospitalId?: string): Promise<PaginatedResult<Case>>;
  save(entity: Case): Promise<Case>;
  nextCaseNumber(): Promise<CaseNumber>;
  countByFilters(filters: CaseCountFilters): Promise<CaseStats>;
}
```

- [ ] **Step 2: Create IDocumentRepository port**

File: `packages/domain/src/ports/document-repository.port.ts`

```typescript
import type { Document } from '../entities/document.entity.js';

export interface IDocumentRepository {
  findById(id: string): Promise<Document | null>;
  findByCaseId(caseId: string): Promise<Document[]>;
  save(doc: Document): Promise<Document>;
  softDelete(id: string): Promise<void>;
}
```

- [ ] **Step 3: Create ICaseProgressRepository port**

File: `packages/domain/src/ports/case-progress-repository.port.ts`

```typescript
import type { CaseProgress } from '../entities/case-progress.entity.js';

export interface ICaseProgressRepository {
  findByCaseId(caseId: string): Promise<CaseProgress[]>;
  save(progress: CaseProgress): Promise<CaseProgress>;
}
```

- [ ] **Step 4: Create IHospitalRepository port**

File: `packages/domain/src/ports/hospital-repository.port.ts`

```typescript
export interface HospitalInfo {
  id: string;
  name: string;
  status: string;
}

export interface IHospitalRepository {
  findById(id: string): Promise<HospitalInfo | null>;
}
```

- [ ] **Step 5: Create IStorageService port**

File: `packages/domain/src/ports/storage-service.port.ts`

```typescript
export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  path: string;
  token: string;
  expiresIn: number;
}

export interface IStorageService {
  createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult>;
  getSignedUrl(key: string): Promise<string>;
  getSignedUrls(keys: string[]): Promise<Record<string, string>>;
}
```

- [ ] **Step 6: Add all ports to barrel export**

Add to `packages/domain/src/index.ts`:

```typescript
// Ports
export type { ICaseRepository, CaseListQuery, CaseCountFilters, CaseStats } from './ports/case-repository.port.js';
export type { IDocumentRepository } from './ports/document-repository.port.js';
export type { ICaseProgressRepository } from './ports/case-progress-repository.port.js';
export type { IHospitalRepository, HospitalInfo } from './ports/hospital-repository.port.js';
export type { IStorageService, PresignedUploadResult } from './ports/storage-service.port.js';
```

- [ ] **Step 7: Typecheck**

```bash
pnpm --filter @medical-crm/domain typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/domain/
git commit -m "feat(domain): add repository and storage port interfaces"
```

---

### Task 8: CaseAssignmentService (TDD)

**Files:**
- Create: `packages/domain/src/services/case-assignment.service.ts`
- Create: `packages/domain/__tests__/case-assignment.service.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Write failing tests**

File: `packages/domain/__tests__/case-assignment.service.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { CaseAssignmentService } from '../src/services/case-assignment.service.js';
import { Case } from '../src/entities/case.entity.js';
import { CaseNumber } from '../src/value-objects/case-number.js';

describe('CaseAssignmentService', () => {
  const service = new CaseAssignmentService();

  function createTestCase(overrides: Record<string, unknown> = {}) {
    return new Case({
      id: 'case-1',
      caseNumber: new CaseNumber('CASE-2026-0001'),
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientCountry: null,
      patientLanguage: 'en',
      assignedHospitalId: null,
      primaryDiagnosis: null,
      diagnosisCode: null,
      symptoms: null,
      medicalHistory: null,
      aiSummary: null,
      aiSummaryLanguage: null,
      riskLevel: null,
      status: 'DRAFT',
      stage: 'PENDING_ASSIGNMENT',
      assignedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });
  }

  it('passes for ACTIVE hospital and unassigned case', () => {
    const c = createTestCase();
    expect(() => service.validateAssignment(c, 'h-1', 'ACTIVE')).not.toThrow();
  });

  it('throws if hospital is PENDING', () => {
    const c = createTestCase();
    expect(() => service.validateAssignment(c, 'h-1', 'PENDING')).toThrow(
      'Hospital must be ACTIVE',
    );
  });

  it('throws if hospital is INACTIVE', () => {
    const c = createTestCase();
    expect(() => service.validateAssignment(c, 'h-1', 'INACTIVE')).toThrow(
      'Hospital must be ACTIVE',
    );
  });

  it('passes if case already assigned but stage is PENDING_ASSIGNMENT', () => {
    const c = createTestCase({ assignedHospitalId: 'old-hospital', stage: 'PENDING_ASSIGNMENT' });
    expect(() => service.validateAssignment(c, 'h-2', 'ACTIVE')).not.toThrow();
  });

  it('throws if case is assigned and stage is past PENDING_ASSIGNMENT', () => {
    const c = createTestCase({ assignedHospitalId: 'old-hospital', stage: 'HOSPITAL_CONTACTED' });
    expect(() => service.validateAssignment(c, 'h-2', 'ACTIVE')).toThrow(
      'Case is already assigned',
    );
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pnpm --filter @medical-crm/domain test
```

- [ ] **Step 3: Implement CaseAssignmentService**

File: `packages/domain/src/services/case-assignment.service.ts`

```typescript
import type { Case } from '../entities/case.entity.js';
import { ValidationError } from '@medical-crm/utils';

export class CaseAssignmentService {
  validateAssignment(caze: Case, hospitalId: string, hospitalStatus: string): void {
    if (hospitalStatus !== 'ACTIVE') {
      throw new ValidationError('Hospital must be ACTIVE to receive case assignments');
    }
    if (caze.assignedHospitalId && caze.stage !== 'PENDING_ASSIGNMENT') {
      throw new ValidationError(
        'Case is already assigned and past PENDING_ASSIGNMENT stage',
      );
    }
  }
}
```

- [ ] **Step 4: Add to barrel export**

Add to `packages/domain/src/index.ts`:

```typescript
export { CaseAssignmentService } from './services/case-assignment.service.js';
```

- [ ] **Step 5: Run all domain tests**

```bash
pnpm --filter @medical-crm/domain test
```

Expected: ALL tests pass (~25 tests across 3 test files).

- [ ] **Step 6: Run typecheck + lint**

```bash
pnpm --filter @medical-crm/domain typecheck && pnpm --filter @medical-crm/domain lint
```

- [ ] **Step 7: Commit**

```bash
git add packages/domain/
git commit -m "feat(domain): add CaseAssignmentService with validation rules"
```

---

## Chunk 2: Application Layer

### Task 9: Scaffold application package + Actor + DTOs

**Files:**
- Create: `packages/application/package.json`
- Create: `packages/application/tsconfig.json`
- Create: `packages/application/vitest.config.ts`
- Create: `packages/application/src/index.ts`
- Create: `packages/application/src/types/actor.ts`
- Create: `packages/application/src/dtos/case.dto.ts`
- Create: `packages/application/src/dtos/document.dto.ts`
- Create: `packages/application/src/dtos/progress.dto.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@medical-crm/application",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@medical-crm/domain": "workspace:*",
    "@medical-crm/utils": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json + vitest.config.ts**

`tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

`vitest.config.ts`: same as domain package (globals: false, environment: 'node').

- [ ] **Step 3: Create Actor type + toActor**

File: `packages/application/src/types/actor.ts`

```typescript
export interface Actor {
  userId: string;
  email: string;
  role: 'ADMIN' | 'HOSPITAL' | 'PATIENT';
  hospitalId: string | null;
}

/** Session type from @medical-crm/infrastructure/auth */
export interface Session {
  userId: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
}

const ROLE_PRIORITY: string[] = ['ADMIN', 'HOSPITAL', 'PATIENT'];

export function toActor(session: Session): Actor {
  const role = ROLE_PRIORITY.find((r) => session.roles.includes(r)) ?? 'PATIENT';
  return {
    userId: session.userId,
    email: session.email,
    role: role as Actor['role'],
    hospitalId: session.hospitalId,
  };
}
```

- [ ] **Step 4: Create DTO types**

File: `packages/application/src/dtos/case.dto.ts`

```typescript
import type { DocumentWithUrlDTO } from './document.dto.js';
import type { DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO } from './progress.dto.js';

export interface CaseDTO {
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
  assignedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HospitalCaseDetailDTO {
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
  diagnoses: DiagnosisDTO[];
  phoneCalls: PhoneCallDTO[];
  consultationHistory: ConsultationHistoryDTO[];
  documents: DocumentWithUrlDTO[];
  totalMessages: number;
  createdAt: string;
  updatedAt: string;
}

export interface CaseStatsDTO {
  total: number;
  unassigned: number;
  active: number;
  completed: number;
  cancelled: number;
}
```

File: `packages/application/src/dtos/document.dto.ts`

```typescript
export interface DocumentDTO {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  sensitivity: string;
  language: string;
  isTranslated: boolean;
  downloadUrl: string;
  createdAt: string;
}

export type DocumentWithUrlDTO = DocumentDTO;
```

File: `packages/application/src/dtos/progress.dto.ts`

```typescript
export interface CaseProgressDTO {
  id: string;
  title: string;
  description: string | null;
  progressType: string;
  metadata: Record<string, unknown> | null;
  recordedAt: string;
  recordedById: string | null;
}

export interface DiagnosisDTO {
  id: string;
  title: string;
  icdCode: string | null;
  severity: string | null;
  treatmentRecommendation: string | null;
  suggestedTests: string | null;
  costEstimate: string | null;
  treatmentDuration: string | null;
  recordedAt: string;
}

export interface PhoneCallDTO {
  id: string;
  title: string;
  callResult: string | null;
  summary: string | null;
  duration: number | null;
  nextFollowUp: string | null;
  recordedAt: string;
}

export interface ConsultationHistoryDTO {
  id: string;
  title: string;
  description: string | null;
  recordedAt: string;
}
```

- [ ] **Step 5: Create barrel export**

File: `packages/application/src/index.ts`

```typescript
// Types
export type { Actor, Session } from './types/actor.js';
export { toActor } from './types/actor.js';

// DTOs
export type { CaseDTO, HospitalCaseDetailDTO, CaseStatsDTO } from './dtos/case.dto.js';
export type { DocumentDTO, DocumentWithUrlDTO } from './dtos/document.dto.js';
export type {
  CaseProgressDTO, DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO,
} from './dtos/progress.dto.js';
```

- [ ] **Step 6: Install deps + typecheck**

```bash
cd /path/to/medical-crm-v2
pnpm install
pnpm --filter @medical-crm/application typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/application/
git commit -m "feat(application): scaffold application package with Actor, DTOs"
```

---

### Task 10: Mappers

**Files:**
- Create: `packages/application/src/mappers/case.mapper.ts`
- Create: `packages/application/src/mappers/document.mapper.ts`
- Create: `packages/application/src/mappers/progress.mapper.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Implement case mapper**

File: `packages/application/src/mappers/case.mapper.ts`

```typescript
import type { Case } from '@medical-crm/domain';
import type { CaseProgress } from '@medical-crm/domain';
import type { Document } from '@medical-crm/domain';
import type { CaseDTO, HospitalCaseDetailDTO } from '../dtos/case.dto.js';
import { splitProgressByType } from './progress.mapper.js';
import { toDocumentDTO } from './document.mapper.js';
import type { CaseStage } from '@medical-crm/domain';

const STAGE_DISPLAY_MAP: Record<CaseStage, string> = {
  PENDING_ASSIGNMENT: 'transferred',
  TRANSFERRED_TO_HOSPITAL: 'transferred',
  HOSPITAL_CONTACTED: 'contacted',
  CONSULTATION_SCHEDULED: 'consultation_scheduled',
  IN_TREATMENT: 'in_treatment',
  TREATMENT_COMPLETED: 'completed',
};

export function toCaseDTO(entity: Case, hospitalName?: string): CaseDTO {
  return {
    id: entity.id,
    caseNumber: entity.caseNumber.value,
    patientName: entity.patientName,
    patientCountry: entity.patientCountry,
    patientLanguage: entity.patientLanguage,
    assignedHospitalId: entity.assignedHospitalId,
    hospitalName: hospitalName ?? null,
    primaryDiagnosis: entity.primaryDiagnosis,
    status: entity.status,
    stage: entity.stage,
    riskLevel: entity.riskLevel,
    aiSummary: entity.aiSummary,
    assignedAt: entity.assignedAt?.toISOString() ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}

export interface PatientInfo {
  id: string;
  code: string;
  age: number | null;
  gender: string | null;
}

export function toHospitalCaseDetailDTO(
  entity: Case,
  progress: CaseProgress[],
  documents: Document[],
  signedUrls: Record<string, string>,
  patient: PatientInfo,
): HospitalCaseDetailDTO {
  const { diagnoses, phoneCalls, consultations } = splitProgressByType(progress);
  return {
    id: entity.id,
    caseNumber: entity.caseNumber.value,
    displayStatus: STAGE_DISPLAY_MAP[entity.stage],
    patient: {
      id: patient.id,
      name: entity.patientName,
      code: patient.code,
      country: entity.patientCountry,
      language: entity.patientLanguage,
      age: patient.age,
      gender: patient.gender,
    },
    medicalCondition: {
      primaryDiagnosis: entity.primaryDiagnosis,
      diagnosisCode: entity.diagnosisCode,
      symptoms: entity.symptoms,
      medicalHistory: entity.medicalHistory,
    },
    aiSummary: entity.aiSummary,
    riskLevel: entity.riskLevel,
    diagnoses,
    phoneCalls,
    consultationHistory: consultations,
    documents: documents.map((d) =>
      toDocumentDTO(d, signedUrls[d.storageKey] ?? ''),
    ),
    totalMessages: 0,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 2: Implement document mapper**

File: `packages/application/src/mappers/document.mapper.ts`

```typescript
import type { Document } from '@medical-crm/domain';
import type { DocumentDTO } from '../dtos/document.dto.js';

export function toDocumentDTO(entity: Document, signedUrl: string): DocumentDTO {
  return {
    id: entity.id,
    fileName: entity.fileName,
    fileSize: entity.fileSize,
    mimeType: entity.mimeType,
    documentType: entity.documentType,
    sensitivity: entity.sensitivity,
    language: entity.language,
    isTranslated: entity.isTranslated,
    downloadUrl: signedUrl,
    createdAt: entity.createdAt.toISOString(),
  };
}
```

- [ ] **Step 3: Implement progress mapper**

File: `packages/application/src/mappers/progress.mapper.ts`

```typescript
import type { CaseProgress } from '@medical-crm/domain';
import type {
  CaseProgressDTO, DiagnosisDTO, PhoneCallDTO, ConsultationHistoryDTO,
} from '../dtos/progress.dto.js';

export function toProgressDTO(entity: CaseProgress): CaseProgressDTO {
  return {
    id: entity.id,
    title: entity.title,
    description: entity.description,
    progressType: entity.progressType,
    metadata: entity.metadata,
    recordedAt: entity.recordedAt.toISOString(),
    recordedById: entity.recordedById,
  };
}

export function splitProgressByType(progress: CaseProgress[]): {
  diagnoses: DiagnosisDTO[];
  phoneCalls: PhoneCallDTO[];
  consultations: ConsultationHistoryDTO[];
} {
  const diagnoses: DiagnosisDTO[] = [];
  const phoneCalls: PhoneCallDTO[] = [];
  const consultations: ConsultationHistoryDTO[] = [];

  for (const p of progress) {
    const meta = (p.metadata ?? {}) as Record<string, unknown>;
    const kind = meta['kind'] as string | undefined;

    if (kind === 'diagnosis') {
      diagnoses.push({
        id: p.id,
        title: p.title,
        icdCode: (meta['icdCode'] as string) ?? null,
        severity: (meta['severity'] as string) ?? null,
        treatmentRecommendation: (meta['treatmentRecommendation'] as string) ?? null,
        suggestedTests: (meta['suggestedTests'] as string) ?? null,
        costEstimate: (meta['costEstimate'] as string) ?? null,
        treatmentDuration: (meta['treatmentDuration'] as string) ?? null,
        recordedAt: p.recordedAt.toISOString(),
      });
    } else if (kind === 'phone_call') {
      phoneCalls.push({
        id: p.id,
        title: p.title,
        callResult: (meta['callResult'] as string) ?? null,
        summary: (meta['summary'] as string) ?? null,
        duration: (meta['duration'] as number) ?? null,
        nextFollowUp: (meta['nextFollowUp'] as string) ?? null,
        recordedAt: p.recordedAt.toISOString(),
      });
    } else if (p.progressType === 'VIDEO_CONSULTATION') {
      consultations.push({
        id: p.id,
        title: p.title,
        description: p.description,
        recordedAt: p.recordedAt.toISOString(),
      });
    }
  }

  return { diagnoses, phoneCalls, consultations };
}
```

- [ ] **Step 4: Update barrel export with mappers**

Add to `packages/application/src/index.ts`:

```typescript
// Mappers
export { toCaseDTO, toHospitalCaseDetailDTO } from './mappers/case.mapper.js';
export type { PatientInfo } from './mappers/case.mapper.js';
export { toDocumentDTO } from './mappers/document.mapper.js';
export { toProgressDTO, splitProgressByType } from './mappers/progress.mapper.js';
```

- [ ] **Step 5: Typecheck**

```bash
pnpm --filter @medical-crm/application typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/application/
git commit -m "feat(application): add case, document, and progress mappers"
```

---

### Task 11: CreateCaseUseCase (TDD)

**Files:**
- Create: `packages/application/src/use-cases/cases/create-case.use-case.ts`
- Create: `packages/application/__tests__/create-case.use-case.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing test**

File: `packages/application/__tests__/create-case.use-case.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateCaseUseCase } from '../src/use-cases/cases/create-case.use-case.js';
import type { ICaseRepository } from '@medical-crm/domain';
import { CaseNumber } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';

describe('CreateCaseUseCase', () => {
  let useCase: CreateCaseUseCase;
  let mockCaseRepo: ICaseRepository;

  const adminActor: Actor = {
    userId: 'admin-1',
    email: 'admin@test.com',
    role: 'ADMIN',
    hospitalId: null,
  };

  const hospitalActor: Actor = {
    userId: 'hospital-1',
    email: 'hospital@test.com',
    role: 'HOSPITAL',
    hospitalId: 'h-1',
  };

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn(),
      findMany: vi.fn(),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      nextCaseNumber: vi.fn().mockResolvedValue(CaseNumber.generate(2026, 1)),
      countByFilters: vi.fn(),
    };
    useCase = new CreateCaseUseCase(mockCaseRepo);
  });

  it('creates a case with DRAFT status and PENDING_ASSIGNMENT stage', async () => {
    const result = await useCase.execute({
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientLanguage: 'en',
    }, adminActor);

    expect(result.status).toBe('DRAFT');
    expect(result.stage).toBe('PENDING_ASSIGNMENT');
    expect(result.caseNumber.value).toBe('CASE-2026-0001');
    expect(mockCaseRepo.save).toHaveBeenCalledOnce();
  });

  it('throws ForbiddenError for non-ADMIN actor', async () => {
    await expect(
      useCase.execute({ patientId: 'p-1', patientName: 'Test' }, hospitalActor),
    ).rejects.toThrow('Only admins can create cases');
  });

  it('passes optional fields to the entity', async () => {
    const result = await useCase.execute({
      patientId: 'patient-1',
      patientName: 'John Doe',
      patientCountry: 'US',
      patientLanguage: 'en',
      primaryDiagnosis: 'Rhinoplasty consultation',
      symptoms: ['nasal obstruction'],
      medicalHistory: 'No prior surgeries',
    }, adminActor);

    expect(result.primaryDiagnosis).toBe('Rhinoplasty consultation');
    expect(result.symptoms).toEqual(['nasal obstruction']);
    expect(result.medicalHistory).toBe('No prior surgeries');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
pnpm --filter @medical-crm/application test
```

- [ ] **Step 3: Implement CreateCaseUseCase**

File: `packages/application/src/use-cases/cases/create-case.use-case.ts`

```typescript
import { Case, type ICaseRepository } from '@medical-crm/domain';
import { generateId, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';

export interface CreateCaseInput {
  patientId: string;
  patientName: string;
  patientCountry?: string;
  patientLanguage?: string;
  primaryDiagnosis?: string;
  symptoms?: string[];
  medicalHistory?: string;
}

export class CreateCaseUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(input: CreateCaseInput, actor: Actor): Promise<Case> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Only admins can create cases');
    }

    const caseNumber = await this.caseRepo.nextCaseNumber();
    const now = new Date();

    const entity = new Case({
      id: generateId(),
      caseNumber,
      patientId: input.patientId,
      patientName: input.patientName,
      patientCountry: input.patientCountry ?? null,
      patientLanguage: input.patientLanguage ?? 'en',
      assignedHospitalId: null,
      primaryDiagnosis: input.primaryDiagnosis ?? null,
      diagnosisCode: null,
      symptoms: input.symptoms ?? null,
      medicalHistory: input.medicalHistory ?? null,
      aiSummary: null,
      aiSummaryLanguage: null,
      riskLevel: null,
      status: 'DRAFT',
      stage: 'PENDING_ASSIGNMENT',
      assignedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    return this.caseRepo.save(entity);
  }
}
```

- [ ] **Step 4: Add to barrel export**

```typescript
export { CreateCaseUseCase } from './use-cases/cases/create-case.use-case.js';
export type { CreateCaseInput } from './use-cases/cases/create-case.use-case.js';
```

- [ ] **Step 5: Run test — expect PASS**

```bash
pnpm --filter @medical-crm/application test
```

- [ ] **Step 6: Commit**

```bash
git add packages/application/
git commit -m "feat(application): add CreateCaseUseCase"
```

---

### Task 12: ListCasesUseCase + GetCaseUseCase (TDD)

**Files:**
- Create: `packages/application/src/use-cases/cases/list-cases.use-case.ts`
- Create: `packages/application/src/use-cases/cases/get-case.use-case.ts`
- Create: `packages/application/__tests__/list-cases.use-case.test.ts`
- Create: `packages/application/__tests__/get-case.use-case.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing tests for ListCasesUseCase**

File: `packages/application/__tests__/list-cases.use-case.test.ts`

Key test cases:
- Hospital actor: `findMany` is called with actor's `hospitalId` forced as filter
- Admin actor: `findMany` is called without hospital filter
- Results are mapped to `CaseDTO[]` via `toCaseDTO`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListCasesUseCase } from '../src/use-cases/cases/list-cases.use-case.js';
import type { ICaseRepository, CaseListQuery } from '@medical-crm/domain';
import type { Actor } from '../src/types/actor.js';
import { Case, CaseNumber } from '@medical-crm/domain';

describe('ListCasesUseCase', () => {
  let useCase: ListCasesUseCase;
  let mockCaseRepo: ICaseRepository;

  const adminActor: Actor = { userId: 'a-1', email: 'a@t.com', role: 'ADMIN', hospitalId: null };
  const hospitalActor: Actor = { userId: 'h-1', email: 'h@t.com', role: 'HOSPITAL', hospitalId: 'hosp-1' };

  const mockCase = new Case({
    id: 'c-1', caseNumber: new CaseNumber('CASE-2026-0001'),
    patientId: 'p-1', patientName: 'Test', patientCountry: null, patientLanguage: 'en',
    assignedHospitalId: 'hosp-1', primaryDiagnosis: null, diagnosisCode: null,
    symptoms: null, medicalHistory: null, aiSummary: null, aiSummaryLanguage: null,
    riskLevel: null, status: 'ACTIVE', stage: 'TRANSFERRED_TO_HOSPITAL',
    assignedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });

  beforeEach(() => {
    mockCaseRepo = {
      findById: vi.fn(),
      findMany: vi.fn().mockResolvedValue({
        data: [mockCase], total: 1, page: 1, limit: 20, totalPages: 1, hasMore: false,
      }),
      save: vi.fn(),
      nextCaseNumber: vi.fn(),
      countByFilters: vi.fn(),
    };
    useCase = new ListCasesUseCase(mockCaseRepo);
  });

  it('forces hospitalId filter for HOSPITAL actor', async () => {
    const query: CaseListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, hospitalActor);
    expect(mockCaseRepo.findMany).toHaveBeenCalledWith(query, 'hosp-1');
  });

  it('does not force hospitalId for ADMIN actor', async () => {
    const query: CaseListQuery = { page: 1, limit: 20 };
    await useCase.execute(query, adminActor);
    expect(mockCaseRepo.findMany).toHaveBeenCalledWith(query, undefined);
  });

  it('returns paginated CaseDTO results', async () => {
    const result = await useCase.execute({ page: 1, limit: 20 }, adminActor);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.caseNumber).toBe('CASE-2026-0001');
  });
});
```

- [ ] **Step 2: Write failing tests for GetCaseUseCase**

File: `packages/application/__tests__/get-case.use-case.test.ts`

Key test cases:
- Returns case for admin
- Hospital actor: throws `ForbiddenError` if case belongs to different hospital
- Throws `NotFoundError` if case doesn't exist

- [ ] **Step 3: Implement both use cases**

File: `packages/application/src/use-cases/cases/list-cases.use-case.ts`

```typescript
import type { ICaseRepository, CaseListQuery } from '@medical-crm/domain';
import type { PaginatedResult } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export class ListCasesUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(query: CaseListQuery, actor: Actor): Promise<PaginatedResult<CaseDTO>> {
    const hospitalId = actor.role === 'HOSPITAL' ? actor.hospitalId! : undefined;
    const result = await this.caseRepo.findMany(query, hospitalId);
    return {
      ...result,
      data: result.data.map((c) => toCaseDTO(c)),
    };
  }
}
```

File: `packages/application/src/use-cases/cases/get-case.use-case.ts`

```typescript
import type { ICaseRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { CaseDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toCaseDTO } from '../../mappers/case.mapper.js';

export class GetCaseUseCase {
  constructor(private readonly caseRepo: ICaseRepository) {}

  async execute(caseId: string, actor: Actor): Promise<CaseDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) {
      throw new NotFoundError(`Case ${caseId} not found`);
    }
    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }
    return toCaseDTO(entity);
  }
}
```

- [ ] **Step 4: Add to barrel, run tests, commit**

```bash
pnpm --filter @medical-crm/application test
git add packages/application/
git commit -m "feat(application): add ListCasesUseCase and GetCaseUseCase"
```

---

### Task 13: GetHospitalCaseDetailUseCase (TDD)

**Files:**
- Create: `packages/application/src/use-cases/cases/get-hospital-case-detail.use-case.ts`
- Create: `packages/application/__tests__/get-hospital-case-detail.use-case.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing test**

File: `packages/application/__tests__/get-hospital-case-detail.use-case.test.ts`

Key test cases:
- Returns aggregated DTO with progress split into diagnoses/phoneCalls/consultations
- Documents include signed URLs
- Hospital actor: verify ownership check
- Admin actor: access any case
- Throws `NotFoundError` for missing case

Note: this use case depends on `ICaseRepository`, `ICaseProgressRepository`, `IDocumentRepository`, `IStorageService`, and `IPatientRepository`. All mocked in tests.

**Spec errata:** The spec defines 4 repository ports but `HospitalCaseDetailDTO.patient.code` requires data from the `users` table (the `patient_code` column). An `IPatientRepository` port is added in this task (not in the original spec). This is the minimal interface needed: `findById(id) → { id, patientCode }`. The corresponding `DrizzlePatientRepository` is implemented in Chunk 3.

```typescript
// Add to packages/domain/src/ports/patient-repository.port.ts
export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
  // age and gender are null until user profile enhanced
}

export interface IPatientRepository {
  findById(id: string): Promise<PatientBasicInfo | null>;
}
```

Test file should mock all 5 dependencies (caseRepo, progressRepo, documentRepo, storageService, patientRepo).

- [ ] **Step 2: Create IPatientRepository port in domain**

File: `packages/domain/src/ports/patient-repository.port.ts`

```typescript
export interface PatientBasicInfo {
  id: string;
  patientCode: string | null;
}

export interface IPatientRepository {
  findById(id: string): Promise<PatientBasicInfo | null>;
}
```

Add to domain barrel export:
```typescript
export type { IPatientRepository, PatientBasicInfo } from './ports/patient-repository.port.js';
```

- [ ] **Step 3: Implement GetHospitalCaseDetailUseCase**

```typescript
import type { ICaseRepository, ICaseProgressRepository, IDocumentRepository, IStorageService, IPatientRepository } from '@medical-crm/domain';
import { NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { HospitalCaseDetailDTO } from '../../dtos/case.dto.js';
import type { Actor } from '../../types/actor.js';
import { toHospitalCaseDetailDTO } from '../../mappers/case.mapper.js';

export class GetHospitalCaseDetailUseCase {
  constructor(
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly documentRepo: IDocumentRepository,
    private readonly storageService: IStorageService,
    private readonly patientRepo: IPatientRepository,
  ) {}

  async execute(caseId: string, actor: Actor): Promise<HospitalCaseDetailDTO> {
    const entity = await this.caseRepo.findById(caseId);
    if (!entity) throw new NotFoundError(`Case ${caseId} not found`);

    if (actor.role === 'HOSPITAL' && entity.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const [progress, documents, patientInfo] = await Promise.all([
      this.progressRepo.findByCaseId(caseId),
      this.documentRepo.findByCaseId(caseId),
      this.patientRepo.findById(entity.patientId),
    ]);

    const storageKeys = documents.map((d) => d.storageKey);
    const signedUrls = storageKeys.length > 0
      ? await this.storageService.getSignedUrls(storageKeys)
      : {};

    return toHospitalCaseDetailDTO(entity, progress, documents, signedUrls, {
      id: entity.patientId,
      code: patientInfo?.patientCode ?? '',
      age: null,
      gender: null,
    });
  }
}
```

- [ ] **Step 4: Run tests, add to barrel, commit**

```bash
pnpm --filter @medical-crm/application test
git add packages/domain/ packages/application/
git commit -m "feat(application): add GetHospitalCaseDetailUseCase with patient lookup"
```

---

### Task 14: Remaining case use cases (TDD)

**Files:**
- Create: `packages/application/src/use-cases/cases/update-case.use-case.ts`
- Create: `packages/application/src/use-cases/cases/assign-case.use-case.ts`
- Create: `packages/application/src/use-cases/cases/update-case-status.use-case.ts`
- Create: `packages/application/src/use-cases/cases/advance-case-stage.use-case.ts`
- Create: `packages/application/src/use-cases/cases/get-case-stats.use-case.ts`
- Create: `packages/application/__tests__/assign-case.use-case.test.ts`
- Create: `packages/application/__tests__/update-case-status.use-case.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing test for AssignCaseUseCase**

Key test cases:
- Calls `CaseAssignmentService.validateAssignment()` then `case.assign()` then `save()`
- Auto-creates STATUS_CHANGE progress entry
- Throws when hospital is not ACTIVE

- [ ] **Step 2: Write failing test for UpdateCaseStatusUseCase**

Key test cases:
- Calls `case.transitionStatus()` then saves + creates progress entry
- Hospital actor: verifies case ownership
- Throws on invalid status transition

- [ ] **Step 3: Implement all 5 use cases**

**UpdateCaseUseCase** — partial update of basic fields (primaryDiagnosis, symptoms, etc.). Hospital: verify ownership.

**AssignCaseUseCase** — fetch hospital via `IHospitalRepository`, validate via `CaseAssignmentService`, call `case.assign()`, create STATUS_CHANGE progress, save.

**UpdateCaseStatusUseCase** — call `case.transitionStatus()`, create progress entry, save.

**AdvanceCaseStageUseCase** — call `case.advanceStage()`, create progress entry, save.

**GetCaseStatsUseCase** — delegate to `caseRepo.countByFilters()`. Hospital: force hospitalId filter.

Each use case follows the pattern:
1. Load entity from repo
2. Check actor permissions
3. Call domain method
4. Save via repo
5. Return DTO

- [ ] **Step 4: Run tests, add to barrel, commit**

```bash
pnpm --filter @medical-crm/application test
git add packages/application/
git commit -m "feat(application): add Update, Assign, Status, Stage, Stats use cases"
```

---

### Task 15: Document use cases (TDD)

**Files:**
- Create: `packages/application/src/use-cases/documents/upload-document.use-case.ts`
- Create: `packages/application/src/use-cases/documents/list-documents.use-case.ts`
- Create: `packages/application/src/use-cases/documents/delete-document.use-case.ts`
- Create: `packages/application/__tests__/upload-document.use-case.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing test for UploadDocumentUseCase**

Key test cases:
- Generates storage key `documents/{caseId}/{uuid}/{fileName}`
- Verifies case ownership for hospital actor
- Calls `storageService.createPresignedUpload()` and returns result
- Saves document metadata to repo
- Creates DOCUMENT_UPLOAD progress entry

- [ ] **Step 2: Implement UploadDocumentUseCase**

```typescript
import type { ICaseRepository, IDocumentRepository, ICaseProgressRepository, IStorageService } from '@medical-crm/domain';
import { Document, CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { PresignedUploadResult } from '@medical-crm/domain';

export interface UploadDocumentInput {
  caseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  sensitivity: string;
  language: string;
}

export class UploadDocumentUseCase {
  constructor(
    private readonly documentRepo: IDocumentRepository,
    private readonly caseRepo: ICaseRepository,
    private readonly progressRepo: ICaseProgressRepository,
    private readonly storageService: IStorageService,
  ) {}

  async execute(input: UploadDocumentInput, actor: Actor): Promise<{ upload: PresignedUploadResult; documentId: string }> {
    const caze = await this.caseRepo.findById(input.caseId);
    if (!caze) throw new NotFoundError(`Case ${input.caseId} not found`);
    if (actor.role === 'HOSPITAL' && caze.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const docId = generateId();
    const storageKey = `documents/${input.caseId}/${docId}/${input.fileName}`;
    const upload = await this.storageService.createPresignedUpload(storageKey, input.mimeType);

    const now = new Date();
    const doc = new Document({
      id: docId,
      caseId: input.caseId,
      uploadedById: actor.userId,
      fileName: input.fileName,
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      storageKey,
      documentType: input.documentType as any,
      sensitivity: input.sensitivity as any,
      language: input.language,
      isTranslated: false,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });
    await this.documentRepo.save(doc);

    await this.progressRepo.save(new CaseProgress({
      id: generateId(),
      caseId: input.caseId,
      title: `Document uploaded: ${input.fileName}`,
      description: null,
      progressType: 'DOCUMENT_UPLOAD',
      metadata: { documentId: docId },
      recordedAt: now,
      recordedById: actor.userId,
    }));

    return { upload, documentId: docId };
  }
}
```

- [ ] **Step 3: Implement ListDocumentsUseCase + DeleteDocumentUseCase**

Both verify case ownership via `ICaseRepository.findById()` before operating on documents.

**ListDocumentsUseCase**: loads documents via `documentRepo.findByCaseId()`, signs all URLs via `storageService.getSignedUrls()`, maps to `DocumentDTO[]`.

**DeleteDocumentUseCase**: loads case to verify ownership, calls `documentRepo.softDelete(docId)`.

- [ ] **Step 4: Run tests, add to barrel, commit**

```bash
pnpm --filter @medical-crm/application test
git add packages/application/
git commit -m "feat(application): add Document use cases (upload, list, delete)"
```

---

### Task 16: Progress use cases (TDD)

**Files:**
- Create: `packages/application/src/use-cases/progress/get-case-progress.use-case.ts`
- Create: `packages/application/src/use-cases/progress/add-case-progress.use-case.ts`
- Create: `packages/application/__tests__/add-case-progress.use-case.test.ts`
- Modify: `packages/application/src/index.ts`

- [ ] **Step 1: Write failing test for AddCaseProgressUseCase**

Key test cases:
- DIAGNOSIS type: maps to `progressType: STATUS_CHANGE`, `metadata: { kind: 'diagnosis', icdCode, ... }`
- PHONE_CALL type: maps to `progressType: APPOINTMENT`, `metadata: { kind: 'phone_call', ... }`
- STATUS_CHANGE type: maps directly
- Verifies case existence and ownership

- [ ] **Step 2: Implement both use cases**

**GetCaseProgressUseCase**: simple delegation to `progressRepo.findByCaseId()`, maps to `CaseProgressDTO[]`.

**AddCaseProgressUseCase**: discriminated union input mapping:

```typescript
import type { ICaseProgressRepository, ICaseRepository } from '@medical-crm/domain';
import { CaseProgress } from '@medical-crm/domain';
import { generateId, NotFoundError, ForbiddenError } from '@medical-crm/utils';
import type { Actor } from '../../types/actor.js';
import type { CaseProgressDTO } from '../../dtos/progress.dto.js';
import { toProgressDTO } from '../../mappers/progress.mapper.js';

export type AddProgressInput =
  | { type: 'DIAGNOSIS'; caseId: string; icdCode?: string; severity?: string;
      treatmentRecommendation?: string; suggestedTests?: string;
      costEstimate?: string; treatmentDuration?: string; }
  | { type: 'PHONE_CALL'; caseId: string; callResult?: string;
      summary?: string; duration?: number; nextFollowUp?: string; }
  | { type: 'STATUS_CHANGE'; caseId: string; reason?: string; }
  | { type: 'DOCUMENT_UPLOAD'; caseId: string; documentId: string; };

export class AddCaseProgressUseCase {
  constructor(
    private readonly progressRepo: ICaseProgressRepository,
    private readonly caseRepo: ICaseRepository,
  ) {}

  async execute(input: AddProgressInput, actor: Actor): Promise<CaseProgressDTO> {
    const caze = await this.caseRepo.findById(input.caseId);
    if (!caze) throw new NotFoundError(`Case ${input.caseId} not found`);
    if (actor.role === 'HOSPITAL' && caze.assignedHospitalId !== actor.hospitalId) {
      throw new ForbiddenError('Access denied to this case');
    }

    const { progressType, title, metadata } = this.mapInput(input);
    const progress = new CaseProgress({
      id: generateId(),
      caseId: input.caseId,
      title,
      description: null,
      progressType,
      metadata,
      recordedAt: new Date(),
      recordedById: actor.userId,
    });

    const saved = await this.progressRepo.save(progress);
    return toProgressDTO(saved);
  }

  private mapInput(input: AddProgressInput) {
    switch (input.type) {
      case 'DIAGNOSIS':
        return {
          progressType: 'STATUS_CHANGE' as const,
          title: 'Diagnosis recorded',
          metadata: {
            kind: 'diagnosis', icdCode: input.icdCode, severity: input.severity,
            treatmentRecommendation: input.treatmentRecommendation,
            suggestedTests: input.suggestedTests, costEstimate: input.costEstimate,
            treatmentDuration: input.treatmentDuration,
          },
        };
      case 'PHONE_CALL':
        return {
          progressType: 'APPOINTMENT' as const,
          title: 'Phone follow-up',
          metadata: {
            kind: 'phone_call', callResult: input.callResult, summary: input.summary,
            duration: input.duration, nextFollowUp: input.nextFollowUp,
          },
        };
      case 'STATUS_CHANGE':
        return {
          progressType: 'STATUS_CHANGE' as const,
          title: 'Status changed',
          metadata: { kind: 'status_change', reason: input.reason },
        };
      case 'DOCUMENT_UPLOAD':
        return {
          progressType: 'DOCUMENT_UPLOAD' as const,
          title: 'Document uploaded',
          metadata: { documentId: input.documentId },
        };
    }
  }
}
```

- [ ] **Step 3: Run all application tests**

```bash
pnpm --filter @medical-crm/application test
```

Expected: ALL tests pass (~35 tests across 8 test files).

- [ ] **Step 4: Run typecheck + lint**

```bash
pnpm --filter @medical-crm/application typecheck && pnpm --filter @medical-crm/application lint
```

- [ ] **Step 5: Commit**

```bash
git add packages/application/
git commit -m "feat(application): add Progress use cases (get, add)"
```

---

## Chunk 3: Infrastructure Layer

> **IMPORTANT: Migration ordering.** Task 17 runs the DB migration and re-introspects the Drizzle schema FIRST. Tasks 18-21 implement repositories that depend on the updated schema (specifically `aiSummary` and `aiSummaryLanguage` columns). Do NOT reorder tasks.

### Task 17: DB migration + schema re-introspection

**Files:**
- Create: `migrations/001-ai-summary-columns.sql`
- Modify: `packages/infrastructure/database/schema/schema.ts` (via `drizzle-kit pull`)

- [ ] **Step 1: Create migration SQL**

File: `migrations/001-ai-summary-columns.sql`

```sql
-- Phase 2A: Consolidate AI summary columns
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS ai_summary_language VARCHAR(10);

-- Migrate existing data (prefer Chinese, fall back to English)
UPDATE cases
SET ai_summary = COALESCE(ai_summary_zh, ai_summary_en),
    ai_summary_language = CASE
      WHEN ai_summary_zh IS NOT NULL THEN 'zh'
      WHEN ai_summary_en IS NOT NULL THEN 'en'
      ELSE NULL
    END
WHERE ai_summary IS NULL
  AND (ai_summary_zh IS NOT NULL OR ai_summary_en IS NOT NULL);

-- Keep old columns for now (drop in future phase after verification)
```

- [ ] **Step 2: Run migration against dev database**

```bash
psql $DATABASE_URL -f migrations/001-ai-summary-columns.sql
```

- [ ] **Step 3: Re-introspect Drizzle schema**

```bash
pnpm --filter @medical-crm/infrastructure db:pull
```

Verify that `schema.ts` now includes `aiSummary` and `aiSummaryLanguage` columns on the `cases` table.

- [ ] **Step 4: Verify typecheck**

```bash
pnpm --filter @medical-crm/infrastructure typecheck
```

- [ ] **Step 5: Commit**

```bash
git add migrations/ packages/infrastructure/database/schema/
git commit -m "feat: add ai_summary migration and re-introspect Drizzle schema"
```

---

### Task 18: Infrastructure package setup + DrizzleCaseRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-case.repository.ts`
- Create: `packages/infrastructure/database/repositories/index.ts`
- Modify: `packages/infrastructure/package.json` (add exports + domain dep)

- [ ] **Step 1: Update infrastructure package.json**

Add to `exports`:
```json
"./repositories": "./database/repositories/index.ts",
"./storage": "./storage/supabase-storage.adapter.ts"
```

Add to `dependencies`:
```json
"@medical-crm/domain": "workspace:*",
"@medical-crm/utils": "workspace:*"
```

- [ ] **Step 2: Implement DrizzleCaseRepository**

File: `packages/infrastructure/database/repositories/drizzle-case.repository.ts`

Key implementation:
- `findById`: `SELECT * FROM cases WHERE id = ?`, reconstruct `Case` entity with `CaseNumber` VO
- `findMany`: compose WHERE from optional filters (status, stage, hospitalId, search with `ilike` on patientName/caseNumber/primaryDiagnosis). Offset pagination with `COUNT(*)`.
- `save`: upsert via `onConflictDoUpdate` on `id`. Auto-set `updatedAt`.
- `nextCaseNumber`: `SELECT MAX(case_number) FROM cases WHERE case_number LIKE 'CASE-{year}-%'`, parse sequence + 1. Optimistic retry (up to 3 attempts) on unique constraint violation.
- `countByFilters`: single query with `COUNT(*) FILTER (WHERE ...)`.

Row-to-entity mapping:
- `row.caseNumber` → `new CaseNumber(row.caseNumber)`
- `row.symptoms` → `row.symptoms as string[] | null`
- Timestamps: `new Date(row.createdAt)` (Drizzle returns string mode timestamps)

- [ ] **Step 3: Create repositories barrel export**

File: `packages/infrastructure/database/repositories/index.ts`

```typescript
export { DrizzleCaseRepository } from './drizzle-case.repository.js';
```

- [ ] **Step 4: Install deps, typecheck**

```bash
pnpm install
pnpm --filter @medical-crm/infrastructure typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/
git commit -m "feat(infrastructure): add DrizzleCaseRepository"
```

---

### Task 19: DrizzleDocumentRepository + DrizzleCaseProgressRepository + DrizzleHospitalRepository + DrizzlePatientRepository

**Files:**
- Create: `packages/infrastructure/database/repositories/drizzle-document.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-case-progress.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-hospital.repository.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-patient.repository.ts`
- Modify: `packages/infrastructure/database/repositories/index.ts`

- [ ] **Step 1: Implement DrizzleDocumentRepository**

- `findById`: simple SELECT with entity reconstruction
- `findByCaseId`: `WHERE case_id = ? AND status != 'DELETED'`, ORDER BY `created_at DESC`
- `save`: INSERT with all fields
- `softDelete`: `UPDATE SET status = 'DELETED', updated_at = NOW()`

- [ ] **Step 2: Implement DrizzleCaseProgressRepository**

- `findByCaseId`: ORDER BY `recorded_at DESC`
- `save`: INSERT, mapping `entity.metadata` → `row.videoSummary` (DB column name)

**Critical mapping:** The `metadata` field in the entity maps to the `video_summary` JSONB column in the DB. The repository must handle this:
```typescript
// Entity → DB
{ videoSummary: entity.metadata }
// DB → Entity
{ metadata: row.videoSummary as Record<string, unknown> | null }
```

- [ ] **Step 3: Implement DrizzleHospitalRepository**

- `findById`: `SELECT id, name, status FROM hospitals WHERE id = ?`

- [ ] **Step 4: Implement DrizzlePatientRepository**

For `IPatientRepository.findById`:
```typescript
// SELECT id, patient_code FROM users WHERE id = ?
```

- [ ] **Step 5: Update barrel export, typecheck, commit**

```bash
pnpm --filter @medical-crm/infrastructure typecheck
git add packages/infrastructure/
git commit -m "feat(infrastructure): add Document, CaseProgress, Hospital, Patient repositories"
```

---

### Task 20: SupabaseStorageAdapter

**Files:**
- Create: `packages/infrastructure/storage/supabase-storage.adapter.ts`
- Modify: `packages/infrastructure/package.json`

- [ ] **Step 1: Implement SupabaseStorageAdapter**

File: `packages/infrastructure/storage/supabase-storage.adapter.ts`

```typescript
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';

const BUCKET = 'documents';
const DEFAULT_EXPIRY = 3600; // 1 hour

export class SupabaseStorageAdapter implements IStorageService {
  constructor(private readonly supabase: SupabaseClient) {}

  async createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(key);
    if (error || !data) {
      throw new Error(`Failed to create presigned upload: ${error?.message ?? 'unknown'}`);
    }
    return {
      uploadUrl: data.signedUrl,
      storageKey: key,
      path: data.path,
      token: data.token,
      expiresIn: DEFAULT_EXPIRY,
    };
  }

  async getSignedUrl(key: string): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(key, DEFAULT_EXPIRY);
    if (error || !data) {
      throw new Error(`Failed to get signed URL: ${error?.message ?? 'unknown'}`);
    }
    return data.signedUrl;
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrls(keys, DEFAULT_EXPIRY);
    if (error || !data) {
      throw new Error(`Failed to get signed URLs: ${error?.message ?? 'unknown'}`);
    }
    const result: Record<string, string> = {};
    for (const item of data) {
      if (item.signedUrl && item.path) {
        result[item.path] = item.signedUrl;
      }
    }
    return result;
  }
}
```

- [ ] **Step 2: Typecheck, commit**

```bash
pnpm --filter @medical-crm/infrastructure typecheck
git add packages/infrastructure/
git commit -m "feat(infrastructure): add SupabaseStorageAdapter"
```

---

### Task 21: Integration test setup + case repository tests

**Files:**
- Create: `packages/infrastructure/vitest.integration.config.ts`
- Create: `packages/infrastructure/__tests__/integration/helpers.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-case.repository.test.ts`
- Modify: `packages/infrastructure/package.json` (add test:integration script)

- [ ] **Step 1: Create integration vitest config**

File: `packages/infrastructure/vitest.integration.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['__tests__/integration/**/*.test.ts'],
    testTimeout: 30000,
  },
});
```

Add script to `package.json`:
```json
"test:integration": "vitest run --config vitest.integration.config.ts"
```

- [ ] **Step 2: Create test helpers**

File: `packages/infrastructure/__tests__/integration/helpers.ts`

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../database/schema/index.js';

// Uses DATABASE_URL from .env.test pointing to medical_crm_test
const testClient = postgres(process.env.DATABASE_URL!, { max: 5 });
export const testDb = drizzle(testClient, { schema });

export async function cleanupTestCases() {
  await testDb.execute(`
    DELETE FROM case_progress WHERE case_id IN (SELECT id FROM cases WHERE case_number LIKE 'TEST-%');
    DELETE FROM documents WHERE case_id IN (SELECT id FROM cases WHERE case_number LIKE 'TEST-%');
    DELETE FROM cases WHERE case_number LIKE 'TEST-%';
  `);
}
```

- [ ] **Step 3: Write integration tests for DrizzleCaseRepository**

Key tests:
- `save` (insert) + `findById` round-trip
- `findMany` with hospital isolation
- `findMany` with search (ilike)
- `nextCaseNumber` sequence increment
- `countByFilters` aggregation
- Cleanup via `TEST-` prefix

- [ ] **Step 4: Run integration tests**

```bash
pnpm --filter @medical-crm/infrastructure test:integration
```

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/
git commit -m "test(infrastructure): add integration tests for DrizzleCaseRepository"
```

---

### Task 22: Document + progress integration tests

**Files:**
- Create: `packages/infrastructure/__tests__/integration/drizzle-document.repository.test.ts`
- Create: `packages/infrastructure/__tests__/integration/drizzle-progress.repository.test.ts`

- [ ] **Step 1: Write document repository integration tests**

Key tests:
- `save` + `findByCaseId` (excludes DELETED)
- `softDelete` changes status
- `findById` returns null for DELETED

- [ ] **Step 2: Write progress repository integration tests**

Key tests:
- `save` + `findByCaseId` (ordered by recorded_at DESC)
- Metadata round-trip (JSONB ↔ entity.metadata via videoSummary column)

- [ ] **Step 3: Run integration tests, commit**

```bash
pnpm --filter @medical-crm/infrastructure test:integration
git add packages/infrastructure/
git commit -m "test(infrastructure): document and progress repository integration tests"
```

---

## Chunk 4: API Routes & Wiring

### Task 23: Extended Zod validation schemas

**Files:**
- Modify: `packages/shared/validation/src/case.schema.ts`
- Create: `packages/shared/validation/src/document.schema.ts`
- Create: `packages/shared/validation/src/progress.schema.ts`
- Modify: `packages/shared/validation/src/index.ts`

- [ ] **Step 1: Extend case schemas**

Add to `packages/shared/validation/src/case.schema.ts`:

```typescript
export const createCaseSchema = z.object({
  patientId: z.string().uuid(),
  patientName: z.string().min(1).max(100),
  patientCountry: z.string().max(100).optional(),
  patientLanguage: z.string().max(10).default('en'),
  primaryDiagnosis: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
  medicalHistory: z.string().optional(),
});

export const updateCaseSchema = z.object({
  primaryDiagnosis: z.string().optional(),
  diagnosisCode: z.string().max(50).optional(),
  symptoms: z.array(z.string()).optional(),
  medicalHistory: z.string().optional(),
  patientCountry: z.string().max(100).optional(),
  patientLanguage: z.string().max(10).optional(),
});

export const assignCaseSchema = z.object({
  hospitalId: z.string().uuid(),
});

export const updateCaseStatusSchema = z.object({
  status: caseStatusSchema,
});

export const advanceCaseStageSchema = z.object({
  stage: caseStageSchema,
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;
export type AssignCaseInput = z.infer<typeof assignCaseSchema>;
```

- [ ] **Step 2: Create document schema**

File: `packages/shared/validation/src/document.schema.ts`

```typescript
import { z } from 'zod';

export const documentTypeSchema = z.enum([
  'LAB', 'IMAGING', 'DISCHARGE', 'PRESCRIPTION',
  'ID', 'DIAGNOSIS', 'QUOTE', 'INVITATION', 'OTHER',
]);
export const sensitivitySchema = z.enum(['PHI_HIGH', 'PHI_MED', 'PHI_LOW']);

export const uploadDocumentSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1).max(100),
  documentType: documentTypeSchema,
  sensitivity: sensitivitySchema.default('PHI_HIGH'),
  language: z.string().max(10).default('en'),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
```

- [ ] **Step 3: Create progress schema**

File: `packages/shared/validation/src/progress.schema.ts`

```typescript
import { z } from 'zod';

export const addProgressSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DIAGNOSIS'),
    icdCode: z.string().optional(),
    severity: z.string().optional(),
    treatmentRecommendation: z.string().optional(),
    suggestedTests: z.string().optional(),
    costEstimate: z.string().optional(),
    treatmentDuration: z.string().optional(),
  }),
  z.object({
    type: z.literal('PHONE_CALL'),
    callResult: z.string().optional(),
    summary: z.string().optional(),
    duration: z.number().optional(),
    nextFollowUp: z.string().optional(),
  }),
  z.object({
    type: z.literal('STATUS_CHANGE'),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('DOCUMENT_UPLOAD'),
    documentId: z.string().uuid(),
  }),
]);

export type AddProgressInput = z.infer<typeof addProgressSchema>;
```

- [ ] **Step 4: Update validation barrel export**

Add to `packages/shared/validation/src/index.ts`:

```typescript
export * from './document.schema';
export * from './progress.schema';
```

- [ ] **Step 5: Typecheck, commit**

```bash
pnpm --filter @medical-crm/validation typecheck
git add packages/shared/validation/
git commit -m "feat(validation): add create/update case, document, progress Zod schemas"
```

---

### Task 24: Composition root refactor + install @hono/zod-openapi

**Files:**
- Modify: `apps/api/src/composition-root.ts`
- Modify: `apps/api/package.json`

- [ ] **Step 1: Install @hono/zod-openapi**

```bash
pnpm --filter @medical-crm/api add @hono/zod-openapi
pnpm --filter @medical-crm/api add @medical-crm/domain@workspace:* @medical-crm/application@workspace:*
```

- [ ] **Step 2: Refactor composition root**

Rename `getInfrastructure()` → `getServices()` and expand:

```typescript
import type { ICaseRepository, IDocumentRepository, ICaseProgressRepository, IHospitalRepository, IStorageService, IPatientRepository } from '@medical-crm/domain';
import { CaseAssignmentService } from '@medical-crm/domain';
import {
  CreateCaseUseCase, ListCasesUseCase, GetCaseUseCase,
  GetHospitalCaseDetailUseCase, UpdateCaseUseCase, AssignCaseUseCase,
  UpdateCaseStatusUseCase, AdvanceCaseStageUseCase, GetCaseStatsUseCase,
  UploadDocumentUseCase, ListDocumentsUseCase, DeleteDocumentUseCase,
  GetCaseProgressUseCase, AddCaseProgressUseCase,
} from '@medical-crm/application';
import { DrizzleCaseRepository, DrizzleDocumentRepository, DrizzleCaseProgressRepository, DrizzleHospitalRepository, DrizzlePatientRepository } from '@medical-crm/infrastructure/repositories';
import { SupabaseStorageAdapter } from '@medical-crm/infrastructure/storage';
import { getCrmDb } from '@medical-crm/infrastructure/database';
import { getMainSupabase } from '@medical-crm/infrastructure/supabase-main';
import { getChinaSupabase } from '@medical-crm/infrastructure/supabase-china';

interface AppServices {
  // infrastructure
  crmDb: ReturnType<typeof getCrmDb>;
  mainSupabase: ReturnType<typeof getMainSupabase>;
  chinaSupabase: ReturnType<typeof getChinaSupabase>;

  // repositories
  caseRepo: ICaseRepository;
  documentRepo: IDocumentRepository;
  progressRepo: ICaseProgressRepository;
  hospitalRepo: IHospitalRepository;
  patientRepo: IPatientRepository;
  storage: IStorageService;

  // use cases
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

let _services: AppServices | null = null;

export function getServices(): AppServices {
  if (!_services) {
    const crmDb = getCrmDb();
    const mainSupabase = getMainSupabase();
    const chinaSupabase = getChinaSupabase();

    // Repositories
    const caseRepo = new DrizzleCaseRepository(crmDb);
    const documentRepo = new DrizzleDocumentRepository(crmDb);
    const progressRepo = new DrizzleCaseProgressRepository(crmDb);
    const hospitalRepo = new DrizzleHospitalRepository(crmDb);
    const patientRepo = new DrizzlePatientRepository(crmDb);
    const storage = new SupabaseStorageAdapter(mainSupabase);

    // Domain services
    const assignmentService = new CaseAssignmentService();

    _services = {
      crmDb, mainSupabase, chinaSupabase,
      caseRepo, documentRepo, progressRepo, hospitalRepo, patientRepo, storage,

      createCase: new CreateCaseUseCase(caseRepo),
      listCases: new ListCasesUseCase(caseRepo),
      getCase: new GetCaseUseCase(caseRepo),
      getHospitalCaseDetail: new GetHospitalCaseDetailUseCase(caseRepo, progressRepo, documentRepo, storage, patientRepo),
      updateCase: new UpdateCaseUseCase(caseRepo),
      assignCase: new AssignCaseUseCase(caseRepo, hospitalRepo, assignmentService, progressRepo),
      updateCaseStatus: new UpdateCaseStatusUseCase(caseRepo, progressRepo),
      advanceCaseStage: new AdvanceCaseStageUseCase(caseRepo, progressRepo),
      getCaseStats: new GetCaseStatsUseCase(caseRepo),
      uploadDocument: new UploadDocumentUseCase(documentRepo, caseRepo, progressRepo, storage),
      listDocuments: new ListDocumentsUseCase(documentRepo, caseRepo, storage),
      deleteDocument: new DeleteDocumentUseCase(documentRepo, caseRepo),
      getCaseProgress: new GetCaseProgressUseCase(progressRepo),
      addCaseProgress: new AddCaseProgressUseCase(progressRepo, caseRepo),
    };
  }
  return _services;
}
```

- [ ] **Step 3: Update apps/api/src/index.ts to import getServices**

Update the health route if it used `getInfrastructure()`.

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @medical-crm/api typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/ packages/infrastructure/
git commit -m "feat(api): refactor composition root to AppServices with use case wiring"
```

---

### Task 25: Case routes

**Files:**
- Create: `apps/api/src/routes/cases.routes.ts`
- Create: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Create case routes with all 8 endpoints**

File: `apps/api/src/routes/cases.routes.ts`

Each route uses `createRoute()` + `app.openapi()`. The route handler derives `Actor` via `toActor(c.get('session'))`, validates input via Zod, calls the appropriate use case, and returns JSON.

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import { getServices } from '../composition-root.js';
import {
  caseListQuerySchema, createCaseSchema, updateCaseSchema,
  assignCaseSchema, updateCaseStatusSchema, advanceCaseStageSchema,
} from '@medical-crm/validation';

const app = new OpenAPIHono();

// 1. POST /api/v2/cases — CreateCase (ADMIN only)
app.openapi(createRoute({ method: 'post', path: '/api/v2/cases',
  request: { body: { content: { 'application/json': { schema: createCaseSchema } } } },
  responses: { 201: { description: 'Created case' } },
}), async (c) => {
  const input = c.req.valid('json');
  const actor = toActor(c.get('session'));
  const result = await getServices().createCase.execute(input, actor);
  return c.json(result, 201);
});

// 2. GET /api/v2/cases — ListCases (ADMIN, HOSPITAL)
app.openapi(createRoute({ method: 'get', path: '/api/v2/cases',
  request: { query: caseListQuerySchema },
  responses: { 200: { description: 'Paginated case list' } },
}), async (c) => {
  const query = c.req.valid('query');
  const actor = toActor(c.get('session'));
  const result = await getServices().listCases.execute(query, actor);
  return c.json(result, 200);
});

// 3. GET /api/v2/cases/stats — GetCaseStats (ADMIN, HOSPITAL)
// NOTE: must be before /:id to avoid path collision
app.openapi(createRoute({ method: 'get', path: '/api/v2/cases/stats',
  responses: { 200: { description: 'Case statistics' } },
}), async (c) => {
  const actor = toActor(c.get('session'));
  const result = await getServices().getCaseStats.execute(actor);
  return c.json(result, 200);
});

// 4. GET /api/v2/cases/:id — GetCase OR GetHospitalCaseDetail
// CRITICAL: role-based branching. HOSPITAL actors get the aggregated detail view.
// ADMIN actors get the basic case view.
app.openapi(createRoute({ method: 'get', path: '/api/v2/cases/{id}',
  request: { params: z.object({ id: z.string().uuid() }) },
  responses: { 200: { description: 'Case detail' } },
}), async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session'));
  if (actor.role === 'HOSPITAL') {
    const result = await getServices().getHospitalCaseDetail.execute(id, actor);
    return c.json(result, 200);
  }
  const result = await getServices().getCase.execute(id, actor);
  return c.json(result, 200);
});

// 5. PATCH /api/v2/cases/:id — UpdateCase (ADMIN, HOSPITAL)
app.openapi(createRoute({ method: 'patch', path: '/api/v2/cases/{id}',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateCaseSchema } } },
  },
  responses: { 200: { description: 'Updated case' } },
}), async (c) => {
  const { id } = c.req.valid('param');
  const input = c.req.valid('json');
  const actor = toActor(c.get('session'));
  const result = await getServices().updateCase.execute(id, input, actor);
  return c.json(result, 200);
});

// 6. PATCH /api/v2/cases/:id/status — UpdateCaseStatus (ADMIN, HOSPITAL)
app.openapi(createRoute({ method: 'patch', path: '/api/v2/cases/{id}/status',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: updateCaseStatusSchema } } },
  },
  responses: { 200: { description: 'Updated status' } },
}), async (c) => {
  const { id } = c.req.valid('param');
  const { status } = c.req.valid('json');
  const actor = toActor(c.get('session'));
  const result = await getServices().updateCaseStatus.execute(id, status, actor);
  return c.json(result, 200);
});

// 7. PATCH /api/v2/cases/:id/stage — AdvanceCaseStage (ADMIN, HOSPITAL)
app.openapi(createRoute({ method: 'patch', path: '/api/v2/cases/{id}/stage',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: advanceCaseStageSchema } } },
  },
  responses: { 200: { description: 'Updated stage' } },
}), async (c) => {
  const { id } = c.req.valid('param');
  const { stage } = c.req.valid('json');
  const actor = toActor(c.get('session'));
  const result = await getServices().advanceCaseStage.execute(id, stage, actor);
  return c.json(result, 200);
});

// 8. POST /api/v2/cases/:id/assign — AssignCase (ADMIN only)
app.openapi(createRoute({ method: 'post', path: '/api/v2/cases/{id}/assign',
  request: {
    params: z.object({ id: z.string().uuid() }),
    body: { content: { 'application/json': { schema: assignCaseSchema } } },
  },
  responses: { 200: { description: 'Case assigned' } },
}), async (c) => {
  const { id } = c.req.valid('param');
  const { hospitalId } = c.req.valid('json');
  const actor = toActor(c.get('session'));
  const result = await getServices().assignCase.execute(id, hospitalId, actor);
  return c.json(result, 200);
});

export default app;
```

- [ ] **Step 2: Create route index and mount in app**

File: `apps/api/src/routes/index.ts`

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import caseRoutes from './cases.routes.js';
import documentRoutes from './documents.routes.js';
import progressRoutes from './progress.routes.js';

const router = new OpenAPIHono();
router.route('/', caseRoutes);
router.route('/', documentRoutes);
router.route('/', progressRoutes);

export default router;
```

Mount in `apps/api/src/index.ts`:
```typescript
import routes from './routes/index.js';
app.route('/', routes);
```

- [ ] **Step 3: Typecheck, commit**

```bash
pnpm --filter @medical-crm/api typecheck
git add apps/api/
git commit -m "feat(api): add case routes with OpenAPI validation"
```

---

### Task 26: Document + Progress routes

**Files:**
- Create: `apps/api/src/routes/documents.routes.ts`
- Create: `apps/api/src/routes/progress.routes.ts`

- [ ] **Step 1: Implement document routes**

3 endpoints following the same pattern as case routes:
- `POST /api/v2/cases/:caseId/documents` — UploadDocumentUseCase
- `GET /api/v2/cases/:caseId/documents` — ListDocumentsUseCase
- `DELETE /api/v2/cases/:caseId/documents/:docId` — DeleteDocumentUseCase

- [ ] **Step 2: Implement progress routes**

2 endpoints:
- `GET /api/v2/cases/:caseId/progress` — GetCaseProgressUseCase
- `POST /api/v2/cases/:caseId/progress` — AddCaseProgressUseCase

- [ ] **Step 3: Typecheck, commit**

```bash
pnpm --filter @medical-crm/api typecheck
git add apps/api/
git commit -m "feat(api): add document and progress routes"
```

---

### Task 27: Route unit tests

**Files:**
- Create: `apps/api/__tests__/cases.routes.test.ts`
- Create: `apps/api/__tests__/documents.routes.test.ts`
- Create: `apps/api/__tests__/progress.routes.test.ts`

- [ ] **Step 1: Write case route tests**

Test pattern: mock use cases at composition root level, test HTTP behavior:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the composition root
vi.mock('../src/composition-root.js', () => ({
  getServices: vi.fn(() => ({
    listCases: { execute: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0, hasMore: false }) },
    createCase: { execute: vi.fn() },
    // ... mock all use cases
  })),
}));

// Mock auth middleware to inject session
vi.mock('@medical-crm/infrastructure/auth', () => ({
  authMiddleware: vi.fn((c, next) => {
    c.set('session', { userId: 'u-1', email: 'test@test.com', roles: ['ADMIN'], hospitalId: null });
    return next();
  }),
}));

describe('GET /api/v2/cases', () => {
  it('returns 200 with paginated results', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await app.request('/api/v2/cases');
    expect(res.status).toBe(200);
  });

  it('validates query params via Zod', async () => {
    const { default: app } = await import('../src/index.js');
    const res = await app.request('/api/v2/cases?page=-1');
    expect(res.status).toBe(422); // or 400 depending on zod-openapi config
  });
});
```

- [ ] **Step 2: Write document + progress route tests**

Same pattern: mock use cases, test HTTP status codes and Zod validation.

- [ ] **Step 3: Run all route tests**

```bash
pnpm --filter @medical-crm/api test
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/
git commit -m "test(api): add route unit tests for cases, documents, progress"
```

---

### Task 28: Final pipeline verification

**Files:**
- Modify: `turbo.json` (add `test:integration` task if needed)

- [ ] **Step 1: Run full turbo pipeline**

```bash
pnpm turbo typecheck
pnpm turbo lint
pnpm turbo test
```

Expected: ALL packages pass typecheck, lint, and test.

- [ ] **Step 2: Fix any issues discovered**

Common issues:
- Missing barrel exports
- Import path `.js` extensions (ESM requirement)
- Unused variables (noUnusedLocals: true)
- ESLint boundary violations (domain importing infrastructure, etc.)

- [ ] **Step 3: Run integration tests separately**

```bash
pnpm --filter @medical-crm/infrastructure test:integration
```

- [ ] **Step 4: Commit final fixes**

```bash
git add .
git commit -m "fix: resolve pipeline issues from full verification"
```

- [ ] **Step 5: Verify test counts**

Expected totals (approximate):
| Layer | Tests |
|-------|-------|
| Domain | ~25 |
| Application | ~35 |
| Infrastructure (integration) | ~20 |
| API Routes | ~20 |
| **Total** | **~100** |

---

## Dependency Graph for Parallel Execution

```
Task 1-8 (Domain Layer) — sequential, no external deps
         ↓
    ┌────┴────┐
    ↓         ↓
Tasks 9-16   Tasks 17-22
(Application) (Infrastructure)
    ↓         ↓
    └────┬────┘
         ↓
Tasks 23-28 (API Routes + Wiring)
```

**Parallel opportunities:**
- Chunk 2 (Application, Tasks 9-16) and Chunk 3 (Infrastructure, Tasks 17-22) can run in parallel after Chunk 1 completes
- Within each chunk, tasks are sequential
- Total: 28 tasks
