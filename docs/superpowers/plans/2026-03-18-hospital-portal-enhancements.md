# Hospital Portal Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AI Summary tab, Quote tab, Procedures Catalog expansion, Email Templates page, FAQ page, and Settings page to the Hospital Portal.

**Architecture:** Incremental additions to the existing `apps/hospital/` Next.js 15 app backed by `apps/api/` Hono server. New backend modules (Email Templates) follow the existing clean architecture pattern in this repo: validation schema → domain entity → domain port (`*.port.ts`) → use case → route. FAQ and Settings reuse existing backend with targeted refactoring. Frontend uses React Query for reads, Server Actions for writes, and the shared `@medical-crm/ui` component library.

**Tech Stack:** Next.js 15, React 19, TanStack React Query, Tailwind CSS v4, Hono + Zod OpenAPI, Drizzle ORM, PostgreSQL

**Spec:** `docs/superpowers/specs/2026-03-18-hospital-portal-enhancements-design.md`

## Execution Guardrails (Apply Before Coding)

1. **Migration-first rule:** execute DB migration tasks before backend/frontend implementation tasks.
2. **Domain naming rule:** use `packages/domain/src/ports/*.port.ts`; do not introduce `packages/domain/src/repositories/`.
3. **Hospital app API rule:** do not use `createMutationHandler` (not present). For BFF mutations, implement explicit `POST/PUT/PATCH/DELETE` handlers using `apiFetch`.
4. **Read/write path rule:** queries go through hospital BFF routes (`/app/api/...`), writes go through Server Actions calling `/api/v2/...` (or explicit BFF mutation handlers when truly needed).
5. **FAQ isolation rule:** never accept `hospitalId` from client query/body for hospital users; derive from `actor.hospitalId` in use cases.

---

## Chunk 0 (Run First): DB Migrations & Schema Prerequisites

### Task 0: Create/Apply Required Migrations Before Feature Work

- [ ] **Step 1: Create migration for `email_templates` table**

Generate Drizzle migration or write SQL:
```sql
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id UUID NOT NULL,
  name VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  variables JSONB DEFAULT '[]',
  status VARCHAR(20) DEFAULT 'draft' NOT NULL,
  created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(6) NOT NULL,
  deleted_at TIMESTAMP(6)
);

CREATE INDEX email_templates_hospital_id_idx ON email_templates (hospital_id);
CREATE INDEX email_templates_type_idx ON email_templates (type);
CREATE INDEX email_templates_status_idx ON email_templates (status);
```

- [ ] **Step 2: Create migration for `chatbot_faq_items.hospital_id`**

```sql
ALTER TABLE chatbot_faq_items ADD COLUMN IF NOT EXISTS hospital_id UUID;
CREATE INDEX IF NOT EXISTS chatbot_faq_items_hospital_id_idx ON chatbot_faq_items (hospital_id);
```

- [ ] **Step 3: Add notification storage for settings**

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_settings JSONB;
```

- [ ] **Step 4: Run migrations**

Run: `pnpm db:migrate`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/database/migrations packages/infrastructure/database/schema/schema.ts
git commit -m "feat: add schema prerequisites for hospital portal enhancements"
```

---

## Chunk 1: Backend — Email Templates Module

### Task 1: Email Template Validation Schemas

**Files:**
- Create: `packages/shared/validation/src/email-template.schema.ts`
- Modify: `packages/shared/validation/src/index.ts`

- [ ] **Step 1: Create validation schemas**

```typescript
// packages/shared/validation/src/email-template.schema.ts
import { z } from 'zod';

export const emailTemplateTypeSchema = z.enum([
  'intro', 'quote', 'marketing', 'followup', 'post_ops', 'custom',
]);

export const emailTemplateStatusSchema = z.enum(['draft', 'active']);

export const createEmailTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  type: emailTemplateTypeSchema,
  subject: z.string().min(1).max(500),
  body: z.string().min(1),
  variables: z.array(z.string()).optional().default([]),
  status: emailTemplateStatusSchema.optional().default('draft'),
});

export const updateEmailTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: emailTemplateTypeSchema.optional(),
  subject: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  variables: z.array(z.string()).optional(),
  status: emailTemplateStatusSchema.optional(),
});

export const emailTemplateListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  type: emailTemplateTypeSchema.optional(),
  status: emailTemplateStatusSchema.optional(),
});

export type CreateEmailTemplateInput = z.infer<typeof createEmailTemplateSchema>;
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;
export type EmailTemplateListQueryInput = z.infer<typeof emailTemplateListQuerySchema>;
```

- [ ] **Step 2: Export from validation index**

Add to `packages/shared/validation/src/index.ts`:
```typescript
export * from './email-template.schema.js';
```

- [ ] **Step 3: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/shared/validation/src/email-template.schema.ts packages/shared/validation/src/index.ts
git commit -m "feat: add email template validation schemas"
```

---

### Task 2: Email Template Domain Entity

**Files:**
- Create: `packages/domain/src/entities/email-template.entity.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] **Step 1: Create entity**

```typescript
// packages/domain/src/entities/email-template.entity.ts
export interface EmailTemplateProps {
  id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class EmailTemplate {
  readonly id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;

  constructor(props: EmailTemplateProps) {
    this.id = props.id;
    this.hospitalId = props.hospitalId;
    this.name = props.name;
    this.type = props.type;
    this.subject = props.subject;
    this.body = props.body;
    this.variables = props.variables;
    this.status = props.status;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.deletedAt = props.deletedAt;
  }

  update(data: Partial<Omit<EmailTemplateProps, 'id' | 'hospitalId' | 'createdAt'>>): void {
    if (data.name !== undefined) this.name = data.name;
    if (data.type !== undefined) this.type = data.type;
    if (data.subject !== undefined) this.subject = data.subject;
    if (data.body !== undefined) this.body = data.body;
    if (data.variables !== undefined) this.variables = data.variables;
    if (data.status !== undefined) this.status = data.status;
    this.updatedAt = new Date();
  }

  softDelete(): void {
    this.deletedAt = new Date();
    this.updatedAt = new Date();
  }
}
```

- [ ] **Step 2: Export from domain index**

Add to `packages/domain/src/index.ts`:
```typescript
export * from './entities/email-template.entity.js';
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/domain/src/entities/email-template.entity.ts packages/domain/src/index.ts
git commit -m "feat: add email template domain entity"
```

---

### Task 3: Email Template DTO & Mapper

**Files:**
- Create: `packages/application/src/dtos/email-template.dto.ts`
- Create: `packages/application/src/mappers/email-template.mapper.ts`

- [ ] **Step 1: Create DTO**

```typescript
// packages/application/src/dtos/email-template.dto.ts
export interface EmailTemplateDTO {
  id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create mapper**

```typescript
// packages/application/src/mappers/email-template.mapper.ts
import type { EmailTemplate } from '@medical-crm/domain';
import type { EmailTemplateDTO } from '../dtos/email-template.dto.js';

export function toEmailTemplateDTO(entity: EmailTemplate): EmailTemplateDTO {
  return {
    id: entity.id,
    hospitalId: entity.hospitalId,
    name: entity.name,
    type: entity.type,
    subject: entity.subject,
    body: entity.body,
    variables: entity.variables,
    status: entity.status,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/dtos/email-template.dto.ts packages/application/src/mappers/email-template.mapper.ts
git commit -m "feat: add email template DTO and mapper"
```

---

### Task 4: Email Template Repository Interface & Drizzle Implementation

**Files:**
- Create: `packages/domain/src/ports/email-template-repository.port.ts`
- Create: `packages/infrastructure/database/repositories/drizzle-email-template.repository.ts`
- Modify: `packages/infrastructure/database/schema/schema.ts` (add email_templates table)

- [ ] **Step 1: Create DB table definition**

Add to `packages/infrastructure/database/schema/schema.ts` after existing tables:

```typescript
export const emailTemplates = pgTable("email_templates", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  hospitalId: uuid("hospital_id").notNull(),
  name: varchar({ length: 200 }).notNull(),
  type: varchar({ length: 50 }).notNull(),
  subject: varchar({ length: 500 }).notNull(),
  body: text().notNull(),
  variables: jsonb().default([]),
  status: varchar({ length: 20 }).default('draft').notNull(),
  createdAt: timestamp("created_at", { precision: 6, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { precision: 6, mode: 'string' }).notNull(),
  deletedAt: timestamp("deleted_at", { precision: 6, mode: 'string' }),
}, (table) => [
  index("email_templates_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast()),
  index("email_templates_type_idx").using("btree", table.type.asc().nullsLast()),
  index("email_templates_status_idx").using("btree", table.status.asc().nullsLast()),
]);
```

- [ ] **Step 2: Create repository interface**

```typescript
// packages/domain/src/ports/email-template-repository.port.ts
import type { EmailTemplate } from '../entities/email-template.entity.js';

export interface EmailTemplateListQuery {
  page: number;
  limit: number;
  type?: string;
  status?: string;
}

export interface IEmailTemplateRepository {
  findById(id: string): Promise<EmailTemplate | null>;
  findByHospital(hospitalId: string, query: EmailTemplateListQuery): Promise<{ data: EmailTemplate[]; total: number }>;
  save(entity: EmailTemplate): Promise<EmailTemplate>;
  softDelete(id: string): Promise<void>;
}
```

- [ ] **Step 3: Create Drizzle repository**

```typescript
// packages/infrastructure/database/repositories/drizzle-email-template.repository.ts
import { eq, and, isNull, count, sql } from 'drizzle-orm';
import { EmailTemplate } from '@medical-crm/domain';
import type { IEmailTemplateRepository, EmailTemplateListQuery } from '@medical-crm/domain';
import { emailTemplates } from '../schema/index.js';
import type { CrmDb } from '../crm-client.js';

export class DrizzleEmailTemplateRepository implements IEmailTemplateRepository {
  constructor(private readonly db: CrmDb) {}

  async findById(id: string): Promise<EmailTemplate | null> {
    const rows = await this.db
      .select()
      .from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), isNull(emailTemplates.deletedAt)))
      .limit(1);
    return rows.length === 0 ? null : this.rowToEntity(rows[0]!);
  }

  async findByHospital(hospitalId: string, query: EmailTemplateListQuery): Promise<{ data: EmailTemplate[]; total: number }> {
    const conditions = [eq(emailTemplates.hospitalId, hospitalId), isNull(emailTemplates.deletedAt)];
    if (query.type) conditions.push(eq(emailTemplates.type, query.type));
    if (query.status) conditions.push(eq(emailTemplates.status, query.status));

    const where = and(...conditions);
    const { page, limit } = query;

    const [rows, countResult] = await Promise.all([
      this.db
        .select()
        .from(emailTemplates)
        .where(where)
        .orderBy(sql`${emailTemplates.updatedAt} DESC`)
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ total: count() }).from(emailTemplates).where(where),
    ]);

    return { data: rows.map((r) => this.rowToEntity(r)), total: Number(countResult[0]?.total ?? 0) };
  }

  async save(entity: EmailTemplate): Promise<EmailTemplate> {
    const now = new Date().toISOString();
    const rows = await this.db
      .insert(emailTemplates)
      .values({
        id: entity.id,
        hospitalId: entity.hospitalId,
        name: entity.name,
        type: entity.type,
        subject: entity.subject,
        body: entity.body,
        variables: entity.variables,
        status: entity.status,
        createdAt: entity.createdAt.toISOString(),
        updatedAt: now,
        deletedAt: entity.deletedAt?.toISOString() ?? null,
      })
      .onConflictDoUpdate({
        target: emailTemplates.id,
        set: {
          name: entity.name,
          type: entity.type,
          subject: entity.subject,
          body: entity.body,
          variables: entity.variables,
          status: entity.status,
          updatedAt: now,
          deletedAt: entity.deletedAt?.toISOString() ?? null,
        },
      })
      .returning();
    return this.rowToEntity(rows[0]!);
  }

  async softDelete(id: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .update(emailTemplates)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(emailTemplates.id, id));
  }

  private rowToEntity(row: typeof emailTemplates.$inferSelect): EmailTemplate {
    return new EmailTemplate({
      id: row.id,
      hospitalId: row.hospitalId,
      name: row.name,
      type: row.type,
      subject: row.subject,
      body: row.body,
      variables: (row.variables as string[]) ?? [],
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      deletedAt: row.deletedAt ? new Date(row.deletedAt) : null,
    });
  }
}
```

- [ ] **Step 4: Export from domain and infrastructure**

Add repository interface export to `packages/domain/src/index.ts`:
```typescript
export * from './ports/email-template-repository.port.js';
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/ports/email-template-repository.port.ts \
  packages/infrastructure/database/repositories/drizzle-email-template.repository.ts \
  packages/infrastructure/database/schema/schema.ts \
  packages/domain/src/index.ts
git commit -m "feat: add email template repository interface and Drizzle implementation"
```

---

### Task 5: Email Template Use Cases

**Files:**
- Create: `packages/application/src/use-cases/email-templates/create-email-template.use-case.ts`
- Create: `packages/application/src/use-cases/email-templates/list-email-templates.use-case.ts`
- Create: `packages/application/src/use-cases/email-templates/get-email-template.use-case.ts`
- Create: `packages/application/src/use-cases/email-templates/update-email-template.use-case.ts`
- Create: `packages/application/src/use-cases/email-templates/delete-email-template.use-case.ts`

- [ ] **Step 1: Create use case**

```typescript
// packages/application/src/use-cases/email-templates/create-email-template.use-case.ts
import { EmailTemplate, type IEmailTemplateRepository } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { CreateEmailTemplateInput } from '@medical-crm/validation';
import { toEmailTemplateDTO } from '../../mappers/email-template.mapper.js';
import type { EmailTemplateDTO } from '../../dtos/email-template.dto.js';
import { ForbiddenError, generateId } from '@medical-crm/utils';

export class CreateEmailTemplateUseCase {
  constructor(private readonly repo: IEmailTemplateRepository) {}

  async execute(hospitalId: string, input: CreateEmailTemplateInput, actor: Actor): Promise<EmailTemplateDTO> {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own templates');
    }

    const entity = new EmailTemplate({
      id: generateId(),
      hospitalId,
      name: input.name,
      type: input.type,
      subject: input.subject,
      body: input.body,
      variables: input.variables ?? [],
      status: input.status ?? 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const saved = await this.repo.save(entity);
    return toEmailTemplateDTO(saved);
  }
}
```

- [ ] **Step 2: Create list use case**

```typescript
// packages/application/src/use-cases/email-templates/list-email-templates.use-case.ts
import type { IEmailTemplateRepository } from '@medical-crm/domain';
import type { Actor } from '../../types/actor.js';
import type { EmailTemplateListQueryInput } from '@medical-crm/validation';
import { ForbiddenError } from '@medical-crm/utils';
import { toEmailTemplateDTO } from '../../mappers/email-template.mapper.js';

export class ListEmailTemplatesUseCase {
  constructor(private readonly repo: IEmailTemplateRepository) {}

  async execute(hospitalId: string, query: EmailTemplateListQueryInput, actor: Actor) {
    if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
      throw new ForbiddenError('Forbidden');
    }
    if (actor.role === 'HOSPITAL' && actor.hospitalId !== hospitalId) {
      throw new ForbiddenError('Hospital users can only manage their own templates');
    }

    const result = await this.repo.findByHospital(hospitalId, query);
    return { data: result.data.map(toEmailTemplateDTO), total: result.total };
  }
}
```

- [ ] **Step 3: Create get, update, delete use cases**

Follow the same pattern as create/list. Each use case:
- `GetEmailTemplateUseCase` — calls `repo.findById(id)`, returns DTO or throws NotFound
- `UpdateEmailTemplateUseCase` — calls `repo.findById(id)`, verifies hospital ownership, calls `entity.update(input)`, saves
- `DeleteEmailTemplateUseCase` — calls `repo.findById(id)`, verifies hospital ownership, calls `repo.softDelete(id)`

Reference `packages/application/src/use-cases/service-catalog/` for exact patterns.

- [ ] **Step 4: Export use cases from application index**

Add exports to `packages/application/src/index.ts`:
```typescript
export * from './use-cases/email-templates/create-email-template.use-case.js';
export * from './use-cases/email-templates/list-email-templates.use-case.js';
export * from './use-cases/email-templates/get-email-template.use-case.js';
export * from './use-cases/email-templates/update-email-template.use-case.js';
export * from './use-cases/email-templates/delete-email-template.use-case.js';
export * from './dtos/email-template.dto.js';
export * from './mappers/email-template.mapper.js';
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/use-cases/email-templates/ \
  packages/application/src/dtos/email-template.dto.ts \
  packages/application/src/mappers/email-template.mapper.ts \
  packages/application/src/index.ts
git commit -m "feat: add email template use cases (CRUD)"
```

---

### Task 6: Email Template API Routes & Composition Root

**Files:**
- Create: `apps/api/src/routes/email-template.routes.ts`
- Modify: `apps/api/src/routes/index.ts`
- Modify: `apps/api/src/composition-root.ts`

- [ ] **Step 1: Create route file**

```typescript
// apps/api/src/routes/email-template.routes.ts
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import {
  createEmailTemplateSchema,
  updateEmailTemplateSchema,
  emailTemplateListQuerySchema,
} from '@medical-crm/validation';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

const hospitalIdParamSchema = z.object({ hospitalId: z.string().uuid() });
const idParamSchema = z.object({ id: z.string().uuid() });

// POST /api/v2/hospitals/{hospitalId}/email-templates
const createRoute_ = createRoute({
  method: 'post',
  path: '/api/v2/hospitals/{hospitalId}/email-templates',
  request: {
    params: hospitalIdParamSchema,
    body: { content: { 'application/json': { schema: createEmailTemplateSchema } }, required: true },
  },
  responses: { 201: { description: 'Email template created' } },
});
app.openapi(createRoute_, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.createEmailTemplate.execute(hospitalId, body, actor);
  return c.json(result, 201);
});

// GET /api/v2/hospitals/{hospitalId}/email-templates
const listRoute = createRoute({
  method: 'get',
  path: '/api/v2/hospitals/{hospitalId}/email-templates',
  request: { params: hospitalIdParamSchema, query: emailTemplateListQuerySchema },
  responses: { 200: { description: 'List email templates' } },
});
app.openapi(listRoute, async (c) => {
  const { hospitalId } = c.req.valid('param');
  const query = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listEmailTemplates.execute(hospitalId, query, actor);
  return c.json(result, 200);
});

// GET /api/v2/email-templates/{id}
const getRoute = createRoute({
  method: 'get',
  path: '/api/v2/email-templates/{id}',
  request: { params: idParamSchema },
  responses: { 200: { description: 'Email template details' } },
});
app.openapi(getRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.getEmailTemplate.execute(id, actor);
  return c.json(result, 200);
});

// PUT /api/v2/email-templates/{id}
const updateRoute = createRoute({
  method: 'put',
  path: '/api/v2/email-templates/{id}',
  request: {
    params: idParamSchema,
    body: { content: { 'application/json': { schema: updateEmailTemplateSchema } }, required: true },
  },
  responses: { 200: { description: 'Email template updated' } },
});
app.openapi(updateRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.updateEmailTemplate.execute(id, body, actor);
  return c.json(result, 200);
});

// DELETE /api/v2/email-templates/{id}
const deleteRoute = createRoute({
  method: 'delete',
  path: '/api/v2/email-templates/{id}',
  request: { params: idParamSchema },
  responses: { 204: { description: 'Email template deleted' } },
});
app.openapi(deleteRoute, async (c) => {
  const { id } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteEmailTemplate.execute(id, actor);
  return c.body(null, 204);
});

export default app;
```

- [ ] **Step 2: Register in route index**

Add to `apps/api/src/routes/index.ts`:
```typescript
import emailTemplateRoutes from './email-template.routes.js';
// ... in the router setup:
router.route('/', emailTemplateRoutes);
```

- [ ] **Step 3: Wire in composition root**

Add to `apps/api/src/composition-root.ts`:
- Import `DrizzleEmailTemplateRepository` and all 5 use cases
- Add to `AppServices` interface
- Instantiate repository and use cases in `getServices()`

Follow exact pattern of `serviceCatalogRepo` / `createServiceCatalogItem` etc.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/email-template.routes.ts \
  apps/api/src/routes/index.ts \
  apps/api/src/composition-root.ts
git commit -m "feat: add email template API routes and wire composition root"
```

---

### Task 7: Email Template Route Tests

**Files:**
- Create: `apps/api/src/__tests__/email-template.routes.test.ts`

- [ ] **Step 1: Write route tests**

Follow the pattern in `apps/api/src/__tests__/service-catalog.routes.test.ts`:
- Mock `composition-root.js`
- Create test app with session middleware
- Test all 5 routes: POST create (201), GET list (200), GET by id (200), PUT update (200), DELETE (204)
- Test validation errors return 400
- Test authorization (non-hospital actor returns 403)

- [ ] **Step 2: Run tests**

Run: `cd apps/api && pnpm test -- --run email-template`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/__tests__/email-template.routes.test.ts
git commit -m "test: add email template route tests"
```

---

## Chunk 2: Backend — FAQ Hospital-Scope Refactor & Settings Extension

### Task 8: FAQ — Add hospital_id to chatbot_faq_items

**Files:**
- Modify: `packages/infrastructure/database/schema/schema.ts` (add hospital_id column)
- Modify: `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts` (if exists, or the repository handling FAQ)

- [ ] **Step 1: Add hospital_id column to schema**

In `packages/infrastructure/database/schema/schema.ts`, modify `chatbotFaqItems`:
```typescript
export const chatbotFaqItems = pgTable("chatbot_faq_items", {
  // ... existing columns ...
  hospitalId: uuid("hospital_id"),  // nullable for backward compat with existing global FAQs
  // ...
});
```

- [ ] **Step 2: Add index for hospital_id**

Add to the table's index array:
```typescript
index("chatbot_faq_items_hospital_id_idx").using("btree", table.hospitalId.asc().nullsLast()),
```

- [ ] **Step 3: Update repository to support hospital filtering**

Find the FAQ repository (`drizzle-chatbot-faq.repository.ts`) and add hospital filtering support.
For hospital actor requests, pass `actor.hospitalId` into repository query inputs from use cases.

```typescript
if (query.actorHospitalId) {
  conditions.push(eq(chatbotFaqItems.hospitalId, query.actorHospitalId));
}
```

Also include `hospitalId` in entity mapping and save/update operations.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/database/schema/schema.ts \
  packages/infrastructure/database/repositories/
git commit -m "feat: add hospital_id to chatbot_faq_items for hospital-scoped FAQ"
```

---

### Task 9: FAQ — Allow HOSPITAL actor in use cases

**Files:**
- Modify: All FAQ use cases in `packages/application/src/use-cases/` that handle FAQ (create, list, get, update, delete)

- [ ] **Step 1: Update authorization in each use case**

Change from:
```typescript
if (actor.role !== 'ADMIN') {
  throw new Error('Forbidden: only ADMIN can list FAQ items');
}
```

To:
```typescript
if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
  throw new Error('Forbidden');
}
```

For HOSPITAL actors, enforce scoping:
- **Create**: set `hospitalId` from `actor.hospitalId`
- **List**: filter by `actor.hospitalId`
- **Get/Update/Delete**: verify the FAQ item belongs to `actor.hospitalId`

- [ ] **Step 2: Keep validation schema hospital-safe**

Do **not** add `hospitalId` as a client-provided FAQ query field for hospital portal routes.
Hospital scoping must be derived from server-side actor context (`actor.hospitalId`), not from request query/body.

- [ ] **Step 3: Run typecheck and tests**

Run: `pnpm typecheck && cd apps/api && pnpm test -- --run chatbot`
Expected: PASS (may need to update existing tests for new role logic)

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/use-cases/ packages/shared/validation/src/
git commit -m "feat: allow HOSPITAL actor in FAQ use cases with hospital-scoped isolation"
```

---

### Task 10: Settings — Extend user profile for notifications

**Files:**
- Modify: `packages/shared/validation/src/user-settings.schema.ts` (extend update schema)
- Modify: `packages/domain/src/ports/user-repository.port.ts` (extend profile/update types)
- Modify: `packages/infrastructure/database/repositories/drizzle-user.repository.ts` (persist notification settings)
- Modify: user profile use case (update profile) to handle `notifications` field

- [ ] **Step 1: Extend update profile schema**

In `packages/shared/validation/src/user-settings.schema.ts`, add `notifications` to the update schema:

```typescript
notifications: z.object({
  newCase: z.boolean().optional(),
  newMessage: z.boolean().optional(),
  quoteStatusChange: z.boolean().optional(),
  consultationReminder: z.boolean().optional(),
}).optional(),
```

- [ ] **Step 2: Ensure storage for notifications**

If not already present, add `notification_settings` JSONB column to users table or user_preferences table. Follow existing DB extension patterns.

- [ ] **Step 3: Update profile use case to persist notifications**

In the update profile use case, handle the `notifications` field and persist to storage.
Also propagate through repository port + implementation:
- `UpdateUserProfileInput` includes `notifications?`
- `UserProfile` includes `notifications?`

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/validation/src/user-settings.schema.ts \
  packages/application/src/use-cases/users/ \
  packages/infrastructure/database/
git commit -m "feat: extend user profile schema for notification preferences"
```

---

## Chunk 3: Frontend — Case Detail Tab Expansion

### Task 11: AI Summary Tab Component

**Files:**
- Create: `apps/hospital/src/components/tabs/case-ai-summary-tab.tsx`

- [ ] **Step 1: Create component**

```typescript
// apps/hospital/src/components/tabs/case-ai-summary-tab.tsx
'use client';

import { Sparkles } from 'lucide-react';

interface CaseAiSummaryTabProps {
  aiSummary?: string | null;
}

export function CaseAiSummaryTab({ aiSummary }: CaseAiSummaryTabProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={18} className="text-indigo-500" />
        <h3 className="text-base font-semibold text-slate-800">AI Summary</h3>
      </div>

      {aiSummary ? (
        <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-5">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiSummary}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Sparkles size={36} className="text-slate-300 mb-3" />
          <p className="text-sm font-medium text-slate-500">No AI summary available</p>
          <p className="text-xs text-slate-400 mt-1">
            An AI-generated summary will appear here once the case has been processed.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/components/tabs/case-ai-summary-tab.tsx
git commit -m "feat: add AI Summary tab component for hospital case detail"
```

---

### Task 12: Quote Tab Component

**Files:**
- Create: `apps/hospital/src/components/tabs/case-quote-tab.tsx`
- Create: `apps/hospital/src/queries/use-quotes.ts`
- Create: `apps/hospital/src/actions/quote-actions.ts`
- Modify: `apps/hospital/src/lib/api-types.ts` (add Quote types)
- Create: `apps/hospital/src/app/api/quotes/route.ts` (BFF proxy)

- [ ] **Step 1: Add Quote types to api-types.ts**

Add to `apps/hospital/src/lib/api-types.ts`:

```typescript
/** Quote item */
export interface QuoteItem {
  id: string;
  caseId: string;
  hospitalId: string;
  totalAmount: string;
  currency: string;
  lineItems?: Array<{ name: string; amount: string }>;
  notes?: string | null;
  validUntil?: string | null;
  status: string; // PENDING | ACCEPTED | REJECTED | EXPIRED
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create BFF proxy route**

```typescript
// apps/hospital/src/app/api/quotes/route.ts
import { createQueryHandler } from '@/lib/route-handler-helpers';

export const GET = createQueryHandler((params) => `/api/v2/quotes?${params}`);
```

For mutations, prefer Server Actions calling `/api/v2/...` directly.
If a mutation BFF route is required, implement explicit handlers using `apiFetch` (do not rely on `createMutationHandler`).

- [ ] **Step 3: Create React Query hooks**

```typescript
// apps/hospital/src/queries/use-quotes.ts
import { useQuery } from '@tanstack/react-query';
import { queryFetch } from '@/lib/query-fetch';

export function useCaseQuotes(caseId: string) {
  return useQuery({
    queryKey: ['quotes', caseId],
    queryFn: () => queryFetch(`/api/quotes?caseId=${caseId}`),
    enabled: !!caseId,
  });
}
```

- [ ] **Step 4: Create server actions**

```typescript
// apps/hospital/src/actions/quote-actions.ts
'use server';
import { revalidatePath } from 'next/cache';
import { apiClient } from '@/lib/api-client';
import { getSessionHospitalId } from '@/lib/session-helpers';

export async function createQuote(data: {
  caseId: string;
  totalAmount: string;
  currency?: string;
  lineItems?: Array<{ name: string; amount: string }>;
  notes?: string;
  validUntil?: string;
}) {
  const hospitalId = await getSessionHospitalId();
  if (!hospitalId) throw new Error('No hospital ID in session');
  const result = await apiClient('/api/v2/quotes', {
    method: 'POST',
    body: JSON.stringify({ ...data, hospitalId }),
  });
  revalidatePath('/cases');
  return result;
}

export async function sendQuote(quoteId: string) {
  const result = await apiClient(`/api/v2/quotes/${quoteId}/send`, {
    method: 'POST',
  });
  revalidatePath('/cases');
  return result;
}
```

- [ ] **Step 5: Create Quote Tab component**

```typescript
// apps/hospital/src/components/tabs/case-quote-tab.tsx
'use client';
// Full component with:
// - Quote list with status badges (PENDING/ACCEPTED/REJECTED/EXPIRED)
// - Create Quote modal with dynamic line items (name + price per row)
// - Auto-calculated total
// - Notes/terms textarea
// - Valid until date picker
// - Upload quote document section
// - Send button for pending quotes
// - Edit button for quotes (PATCH)
```

Key UI elements:
- Dynamic line items: `useState<Array<{name: string; amount: string}>>` with add/remove
- Total auto-calc: `useMemo` summing all amounts
- No DRAFT status — unsent quotes are just form state in the modal
- Status badges using `<StatusBadge>` from `@medical-crm/ui`

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/hospital/src/components/tabs/case-quote-tab.tsx \
  apps/hospital/src/queries/use-quotes.ts \
  apps/hospital/src/actions/quote-actions.ts \
  apps/hospital/src/lib/api-types.ts \
  apps/hospital/src/app/api/quotes/
git commit -m "feat: add Quote tab with line items, send, and document upload"
```

---

### Task 13: Integrate New Tabs into Case Detail Panel

**Files:**
- Modify: `apps/hospital/src/components/case-detail-panel.tsx`

- [ ] **Step 1: Update tab definitions**

In `case-detail-panel.tsx`, replace the `tabs` array (line 58-66):

```typescript
import { Receipt } from 'lucide-react';
import { CaseAiSummaryTab } from './tabs/case-ai-summary-tab';
import { CaseQuoteTab } from './tabs/case-quote-tab';

const tabs = [
  { id: 'ai-summary', label: 'AI Summary', icon: Sparkles },
  { id: 'intake', label: 'Intake', icon: FileText },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'diagnosis', label: 'Diagnosis', icon: Stethoscope },
  { id: 'quote', label: 'Quote', icon: Receipt },
  { id: 'marketing', label: 'Marketing', icon: Megaphone },
  { id: 'invitation', label: 'Invitation Letter', icon: FileSignature },
  { id: 'consultation', label: 'Consultation', icon: Video },
];
```

- [ ] **Step 2: Update default active tab**

Change `useState('intake')` to `useState('ai-summary')`.

- [ ] **Step 3: Add tab content rendering**

In the tab content section, add:
```tsx
{activeTab === 'ai-summary' && <CaseAiSummaryTab aiSummary={caseDetail.aiSummary} />}
{activeTab === 'quote' && <CaseQuoteTab caseId={caseDetail.id} />}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/hospital/src/components/case-detail-panel.tsx
git commit -m "feat: integrate AI Summary and Quote tabs into case detail (7→9 tabs)"
```

---

## Chunk 4: Frontend — Materials Procedures Expansion

### Task 14: Expand Procedures in Materials Tab

**Files:**
- Modify: `apps/hospital/src/lib/api-types.ts` (extend `MaterialsProcedureDTO`)
- Modify: `apps/hospital/src/components/materials-tabs.tsx` (Procedures section)

- [ ] **Step 1: Extend MaterialsProcedureDTO**

Add to `MaterialsProcedureDTO` in `api-types.ts`:

```typescript
recoveryTime?: string | null;
duration?: string | null;
hospitalStayDays?: string | null;
indications?: string | null;
risks?: string | null;
inclusions?: string[];
```

- [ ] **Step 2: Expand procedure create/edit modal**

In `materials-tabs.tsx`, find the procedure form modal and add new fields:
- Recovery Time (text input, placeholder "e.g. 2-4 weeks")
- Duration (text input, placeholder "e.g. 2-3 hours")
- Hospital Stay (text input, placeholder "e.g. 1-2 days")
- Indications (textarea)
- Risks (textarea)
- Inclusions (dynamic list of text inputs, similar to quote line items)

- [ ] **Step 3: Display new fields in procedure cards**

Add a collapsible "Details" section to each procedure card showing the new fields when available.

- [ ] **Step 4: Update create/update actions**

Ensure `createProcedure` and `updateProcedure` in `materials-actions.ts` pass the new fields to the API.

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/hospital/src/lib/api-types.ts \
  apps/hospital/src/components/materials-tabs.tsx \
  apps/hospital/src/actions/materials-actions.ts
git commit -m "feat: expand Procedures tab into Procedures Catalog with detail fields"
```

---

## Chunk 5: Frontend — New Pages (Email Templates, FAQ, Settings)

### Task 15: Sidebar Navigation Update

**Files:**
- Modify: `apps/hospital/src/components/portal-shell.tsx`

- [ ] **Step 1: Add new nav items**

```typescript
import { LayoutDashboard, FolderOpen, Video, MessageSquare, Megaphone, LogOut, Search, Bell, Mail, HelpCircle, Settings } from 'lucide-react';

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
  { key: 'cases', label: 'Cases', icon: <FolderOpen size={20} />, href: '/cases' },
  { key: 'consultations', label: 'Consultations', icon: <Video size={20} />, href: '/consultations' },
  { key: 'messages', label: 'Messages', icon: <MessageSquare size={20} />, href: '/messages' },
  { key: 'materials', label: 'Materials', icon: <Megaphone size={20} />, href: '/materials' },
  { key: 'email-templates', label: 'Email Templates', icon: <Mail size={20} />, href: '/email-templates' },
  { key: 'faq', label: 'Chatbot & FAQ', icon: <HelpCircle size={20} />, href: '/faq' },
  { key: 'settings', label: 'Settings', icon: <Settings size={20} />, href: '/settings' },
];
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/components/portal-shell.tsx
git commit -m "feat: update hospital sidebar nav (5→8 items)"
```

---

### Task 16: Email Templates Page

**Files:**
- Create: `apps/hospital/src/app/(portal)/email-templates/page.tsx`
- Create: `apps/hospital/src/components/email-templates-list.tsx`
- Create: `apps/hospital/src/queries/use-email-templates.ts`
- Create: `apps/hospital/src/actions/email-template-actions.ts`
- Create: `apps/hospital/src/app/api/email-templates/route.ts` (BFF)
- Create: `apps/hospital/src/app/api/email-templates/[id]/route.ts` (BFF)
- Modify: `apps/hospital/src/lib/api-types.ts` (add EmailTemplate type)

- [ ] **Step 1: Add EmailTemplate type**

Add to `api-types.ts`:
```typescript
export interface EmailTemplateItem {
  id: string;
  hospitalId: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  variables: string[];
  status: string;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Create BFF routes**

```typescript
// apps/hospital/src/app/api/email-templates/route.ts
// GET only: proxy to /api/v2/hospitals/{hospitalId}/email-templates
```

```typescript
// apps/hospital/src/app/api/email-templates/[id]/route.ts
// GET: proxy to /api/v2/email-templates/{id}
// (optional) keep GET only for detail preload
```

Use Server Actions for create/update/delete writes (`/api/v2/...`).

- [ ] **Step 3: Create React Query hooks**

```typescript
// apps/hospital/src/queries/use-email-templates.ts
export function useEmailTemplates(type?: string, status?: string) { ... }
```

- [ ] **Step 4: Create server actions**

```typescript
// apps/hospital/src/actions/email-template-actions.ts
'use server';
export async function createEmailTemplate(data: {...}) { ... }
export async function updateEmailTemplate(id: string, data: {...}) { ... }
export async function deleteEmailTemplate(id: string) { ... }
```

- [ ] **Step 5: Create list component**

```typescript
// apps/hospital/src/components/email-templates-list.tsx
'use client';
// Full component with:
// - Type filter tabs (All/Intro/Quote/Marketing/Follow-up/Post-Ops)
// - Search by template name
// - Table with columns: Name, Type, Subject, Status, Updated, Actions
// - Create/Edit modal with:
//   - Name, Type dropdown, Subject, Body textarea
//   - Variable insert chips ({{patient_name}}, etc.)
//   - Status toggle (draft/active)
//   - Preview section
// - Delete confirmation dialog
```

- [ ] **Step 6: Create page**

```typescript
// apps/hospital/src/app/(portal)/email-templates/page.tsx
import { EmailTemplatesList } from '@/components/email-templates-list';

export default function EmailTemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Email Templates</h1>
        <p className="text-sm text-slate-500 mt-1">Manage email templates for patient communications</p>
      </div>
      <EmailTemplatesList />
    </div>
  );
}
```

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/email-templates/ \
  apps/hospital/src/components/email-templates-list.tsx \
  apps/hospital/src/queries/use-email-templates.ts \
  apps/hospital/src/actions/email-template-actions.ts \
  apps/hospital/src/app/api/email-templates/ \
  apps/hospital/src/lib/api-types.ts
git commit -m "feat: add Email Templates page with CRUD and variable insertion"
```

---

### Task 17: Email Template Integration with Case Marketing

**Files:**
- Modify: `apps/hospital/src/components/case-detail-panel.tsx` (Marketing tab → Email sub-tab)

- [ ] **Step 1: Add "Load Template" dropdown to email sub-tab**

In the Marketing tab's Email section, add:
- A dropdown that fetches active email templates via `useEmailTemplates(undefined, 'active')`
- On template selection: populate subject and body fields
- Auto-replace variables with current case data (`{{patient_name}}` → `caseDetail.patient.name`, etc.)

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/hospital/src/components/case-detail-panel.tsx
git commit -m "feat: integrate email template loading in Case Marketing tab"
```

---

### Task 18: FAQ Page

**Files:**
- Create: `apps/hospital/src/app/(portal)/faq/page.tsx`
- Create: `apps/hospital/src/components/faq-list.tsx`
- Create: `apps/hospital/src/queries/use-faqs.ts`
- Create: `apps/hospital/src/actions/faq-actions.ts`
- Create: `apps/hospital/src/app/api/chatbot-faq/route.ts` (BFF)
- Create: `apps/hospital/src/app/api/chatbot-faq/[id]/route.ts` (BFF)

- [ ] **Step 1: Create BFF routes**

Create read-oriented BFF handlers (GET list and optional GET detail) proxying to `/api/v2/chatbot/faqs`.
Use Server Actions for create/update/delete writes.

- [ ] **Step 2: Create React Query hooks**

```typescript
// apps/hospital/src/queries/use-faqs.ts
export function useFaqItems(category?: string) { ... }
```

- [ ] **Step 3: Create server actions**

```typescript
// apps/hospital/src/actions/faq-actions.ts
'use server';
export async function createFaqItem(data: {...}) { ... }
export async function updateFaqItem(id: string, data: {...}) { ... }
export async function deleteFaqItem(id: string) { ... }
```

- [ ] **Step 4: Create FAQ list component**

```typescript
// apps/hospital/src/components/faq-list.tsx
'use client';
// Full component with:
// - Category filter tabs (All/General/Pricing/Procedures/Recovery/Travel/Insurance)
// - Search by question text
// - Card/table list showing question (en/zh), category, status
// - Create/Edit modal with bilingual fields:
//   - Question EN + Question ZH
//   - Answer EN + Answer ZH
//   - Category dropdown
//   - Keywords (comma-separated)
//   - Active toggle
// - Delete confirmation
```

- [ ] **Step 5: Create page**

```typescript
// apps/hospital/src/app/(portal)/faq/page.tsx
import { FaqList } from '@/components/faq-list';

export default function FaqPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Chatbot & FAQ</h1>
        <p className="text-sm text-slate-500 mt-1">Manage frequently asked questions for AI chatbot</p>
      </div>
      <FaqList />
    </div>
  );
}
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/faq/ \
  apps/hospital/src/components/faq-list.tsx \
  apps/hospital/src/queries/use-faqs.ts \
  apps/hospital/src/actions/faq-actions.ts \
  apps/hospital/src/app/api/chatbot-faq/
git commit -m "feat: add FAQ management page with bilingual CRUD"
```

---

### Task 19: Settings Page

**Files:**
- Create: `apps/hospital/src/app/(portal)/settings/page.tsx`
- Create: `apps/hospital/src/components/settings-view.tsx`
- Create: `apps/hospital/src/actions/settings-actions.ts`

- [ ] **Step 1: Create server actions**

```typescript
// apps/hospital/src/actions/settings-actions.ts
'use server';
import { apiClient } from '@/lib/api-client';
import { revalidatePath } from 'next/cache';

export async function changePassword(data: {
  currentPassword: string;
  newPassword: string;
}) {
  const result = await apiClient('/api/v2/users/me/change-password', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result;
}

export async function updatePreferences(data: {
  preferredLanguage?: string;
  notifications?: Record<string, boolean>;
}) {
  const result = await apiClient('/api/v2/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  revalidatePath('/settings');
  return result;
}
```

- [ ] **Step 2: Create settings component**

```typescript
// apps/hospital/src/components/settings-view.tsx
'use client';
// Three Card sections:
// 1. Password Management:
//    - Current password, new password, confirm password inputs
//    - Save button calling changePassword action
//    - Success/error toast feedback
// 2. Preferred Language:
//    - Dropdown (English / 中文)
//    - Save button calling updatePreferences
// 3. Email Notifications:
//    - Toggle switches for: newCase, newMessage, quoteStatusChange, consultationReminder
//    - Save button calling updatePreferences
```

- [ ] **Step 3: Create page**

```typescript
// apps/hospital/src/app/(portal)/settings/page.tsx
import { SettingsView } from '@/components/settings-view';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account and notification preferences</p>
      </div>
      <SettingsView />
    </div>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/hospital/src/app/\(portal\)/settings/ \
  apps/hospital/src/components/settings-view.tsx \
  apps/hospital/src/actions/settings-actions.ts
git commit -m "feat: add Settings page (password, language, notifications)"
```

---

## Chunk 6: Final Integration & Verification

### Task 20: Full Typecheck & Build

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: All packages PASS

- [ ] **Step 2: Run full build**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Run all tests**

Run: `cd apps/api && pnpm test -- --run`
Expected: All tests PASS

- [ ] **Step 4: Fix any issues found**

Address any typecheck, build, or test failures.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve any remaining typecheck or build issues"
```

---

### Task 21: Migration Checkpoint (Do Not Re-run)

Migration work is already defined and required in **Chunk 0 / Task 0**.
At this stage, only verify migrations were applied successfully in the target environment.
