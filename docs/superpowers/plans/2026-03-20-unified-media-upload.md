# Unified Media Upload Service — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragmented upload logic with a unified `MediaUploadService` backed by a policy registry and multi-backend storage adapters (R2 + S3 + Supabase legacy).

**Architecture:** Application-layer `MediaUploadService` orchestrates uploads via `UploadPolicyRegistry` (14 policies) and `StorageAdapterRegistry` (4 backends: `r2-private`, `r2-materials-beauty`, `s3-materials`, `supabase-legacy`). `RoutedStorageService` replaces direct Supabase injection for reads, routing by storage key prefix. All existing upload routes refactored atomically to use `MediaUploadService`; 4 new upload-init endpoints added.

**Tech Stack:** Hono, Drizzle ORM, `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, Vitest, Zod

**Spec:** `docs/superpowers/specs/2026-03-20-unified-media-upload-design.md`

---

## Chunk 1: Foundation — Types, Adapters, Core Service

### Task 1: Update `PresignedUploadResult` and env schema

**Files:**
- Modify: `packages/domain/src/ports/storage-service.port.ts:1-7`
- Modify: `packages/shared/config/src/env.ts:20-25`
- Modify: `packages/infrastructure/storage/supabase-storage.adapter.ts:17-21`

- [ ] **Step 1: Update PresignedUploadResult — make path/token optional**

```typescript
// packages/domain/src/ports/storage-service.port.ts
export interface PresignedUploadResult {
  uploadUrl: string;
  storageKey: string;
  path?: string;
  token?: string;
  expiresIn: number;
}

export interface IStorageService {
  createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult>;

  /**
   * Returns a download URL for the given storage key.
   * May return a signed temporary URL (R2, Supabase) or
   * a controlled public URL (CloudFront-backed S3 or public R2 beauty materials).
   * Callers should treat the result as an opaque download URL
   * with no assumption about expiry semantics.
   */
  getSignedUrl(key: string): Promise<string>;
  getSignedUrls(keys: string[]): Promise<Record<string, string>>;
}
```

- [ ] **Step 2: Update env.ts — add private R2, beauty R2, and required AWS storage vars**

```typescript
// packages/shared/config/src/env.ts — replace lines 20-25 with:
  // Storage (CRM file storage - legacy Supabase)
  CRM_SUPABASE_URL: z.string().url(),
  CRM_SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // R2 (primary CRM media storage)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET_NAME: z.string().min(1),
  // R2 beauty materials (medora-images bucket — public, for Medora Beauty website)
  R2_MATERIALS_BEAUTY_BUCKET_NAME: z.string().min(1),
  R2_MATERIALS_BEAUTY_PUBLIC_URL: z.string().url(),
  // AWS S3 (regular hospital materials — required, legacy reads depend on s3-materials)
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_REGION: z.string().default('eu-west-1'),
  AWS_S3_BUCKET: z.string().default('medchina-cloudfront'),
  AWS_CLOUDFRONT_URL: z.string().url().optional(),
```

- [ ] **Step 3: Rename .env variable**

```bash
# In .env: rename CLOUDFLARE_ACCOUNT_ID → R2_ACCOUNT_ID
# (value stays the same: 82cdbf36c265c0d9e4b4e1c6100c26d7)
```

- [ ] **Step 4: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: All packages pass (PresignedUploadResult fields are now optional, so existing code that assigns them still compiles)

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/ports/storage-service.port.ts packages/shared/config/src/env.ts
git commit -m "chore: make PresignedUploadResult path/token optional, update env schema for R2+S3"
```

> Note: `.env` is not committed. The `CLOUDFLARE_ACCOUNT_ID → R2_ACCOUNT_ID` rename is a local/deployment config change, not tracked in git.

---

### Task 2: Install AWS SDK and add R2StorageAdapter

**Files:**
- Modify: `packages/infrastructure/package.json:30-41`
- Create: `packages/infrastructure/storage/r2-storage.adapter.ts`
- Create: `packages/infrastructure/storage/__tests__/r2-storage.adapter.test.ts`

- [ ] **Step 1: Install AWS SDK**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`

- [ ] **Step 2: Write failing test for R2StorageAdapter**

```typescript
// packages/infrastructure/storage/__tests__/r2-storage.adapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { R2StorageAdapter } from '../r2-storage.adapter.js';

// Mock AWS SDK
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://signed-url.example.com'),
}));

describe('R2StorageAdapter', () => {
  let adapter: R2StorageAdapter;

  beforeEach(() => {
    adapter = new R2StorageAdapter({
      accountId: 'test-account',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      bucketName: 'test-bucket',
    });
  });

  it('creates presigned upload URL', async () => {
    const result = await adapter.createPresignedUpload('crm/dev/test/key.jpg', 'image/jpeg');
    expect(result.uploadUrl).toBe('https://signed-url.example.com');
    expect(result.storageKey).toBe('crm/dev/test/key.jpg');
    expect(result.expiresIn).toBe(600);
    expect(result.path).toBeUndefined();
    expect(result.token).toBeUndefined();
  });

  it('gets signed download URL', async () => {
    const url = await adapter.getSignedUrl('crm/dev/test/key.jpg');
    expect(url).toBe('https://signed-url.example.com');
  });

  it('gets batch signed URLs', async () => {
    const urls = await adapter.getSignedUrls(['key1.jpg', 'key2.jpg']);
    expect(urls['key1.jpg']).toBe('https://signed-url.example.com');
    expect(urls['key2.jpg']).toBe('https://signed-url.example.com');
  });

  it('returns empty object for empty keys array', async () => {
    const urls = await adapter.getSignedUrls([]);
    expect(urls).toEqual({});
  });

  describe('with publicUrl (beauty materials mode)', () => {
    let publicAdapter: R2StorageAdapter;

    beforeEach(() => {
      publicAdapter = new R2StorageAdapter({
        accountId: 'test-account',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucketName: 'medora-images',
        publicUrl: 'https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev',
      });
    });

    it('returns public URL for getSignedUrl instead of presigned', async () => {
      const url = await publicAdapter.getSignedUrl('materials-beauty/surgeon/123/ast_456/photo.jpg');
      expect(url).toBe('https://pub-364a76a828f94fbeb2b09c625907dcf5.r2.dev/materials-beauty/surgeon/123/ast_456/photo.jpg');
    });

    it('still creates presigned upload URL', async () => {
      const result = await publicAdapter.createPresignedUpload('key.jpg', 'image/jpeg');
      expect(result.uploadUrl).toBe('https://signed-url.example.com');
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/r2-storage.adapter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement R2StorageAdapter**

```typescript
// packages/infrastructure/storage/r2-storage.adapter.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';

const UPLOAD_EXPIRY = 600;   // 10 minutes
const DOWNLOAD_EXPIRY = 3600; // 1 hour

export class R2StorageAdapter implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl?: string;

  constructor(config: {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl?: string;  // If set, getSignedUrl returns public URL instead of signed URL
  }) {
    this.bucket = config.bucketName;
    this.publicUrl = config.publicUrl;
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_EXPIRY });
    return { uploadUrl, storageKey: key, expiresIn: UPLOAD_EXPIRY };
  }

  async getSignedUrl(key: string): Promise<string> {
    // If publicUrl is set (e.g. medora-images bucket), return public URL directly
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_EXPIRY });
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const entries = await Promise.all(
      keys.map(async (k) => [k, await this.getSignedUrl(k)] as const),
    );
    return Object.fromEntries(entries);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/r2-storage.adapter.test.ts`
Expected: PASS — all tests (add test for publicUrl mode too)

- [ ] **Step 6: Commit**

```bash
git add packages/infrastructure/storage/r2-storage.adapter.ts packages/infrastructure/storage/__tests__/r2-storage.adapter.test.ts packages/infrastructure/package.json pnpm-lock.yaml
git commit -m "feat: add R2StorageAdapter implementing IStorageService"
```

---

### Task 3: Add S3StorageAdapter

**Files:**
- Create: `packages/infrastructure/storage/s3-storage.adapter.ts`
- Create: `packages/infrastructure/storage/__tests__/s3-storage.adapter.test.ts`

- [ ] **Step 1: Write failing test for S3StorageAdapter**

```typescript
// packages/infrastructure/storage/__tests__/s3-storage.adapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3StorageAdapter } from '../s3-storage.adapter.js';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(() => ({})),
  PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3-signed.example.com'),
}));

describe('S3StorageAdapter', () => {
  describe('with CloudFront', () => {
    let adapter: S3StorageAdapter;

    beforeEach(() => {
      adapter = new S3StorageAdapter({
        region: 'eu-west-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucketName: 'medchina-cloudfront',
        cloudfrontUrl: 'https://d1wwcixye6at8o.cloudfront.net',
      });
    });

    it('creates presigned upload with CacheControl', async () => {
      const result = await adapter.createPresignedUpload('hospital_photos/test.jpg', 'image/jpeg');
      expect(result.uploadUrl).toBe('https://s3-signed.example.com');
      expect(result.storageKey).toBe('hospital_photos/test.jpg');
      expect(result.expiresIn).toBe(3600);
    });

    it('returns CloudFront URL for getSignedUrl (not S3 presigned)', async () => {
      const url = await adapter.getSignedUrl('hospital_photos/public/123/hero.jpg');
      expect(url).toBe('https://d1wwcixye6at8o.cloudfront.net/hospital_photos/public/123/hero.jpg');
    });

    it('returns CloudFront URLs for batch', async () => {
      const urls = await adapter.getSignedUrls(['key1.jpg', 'key2.jpg']);
      expect(urls['key1.jpg']).toBe('https://d1wwcixye6at8o.cloudfront.net/key1.jpg');
      expect(urls['key2.jpg']).toBe('https://d1wwcixye6at8o.cloudfront.net/key2.jpg');
    });
  });

  describe('without CloudFront', () => {
    let adapter: S3StorageAdapter;

    beforeEach(() => {
      adapter = new S3StorageAdapter({
        region: 'eu-west-1',
        accessKeyId: 'test-key',
        secretAccessKey: 'test-secret',
        bucketName: 'test-bucket',
      });
    });

    it('falls back to S3 presigned URL for getSignedUrl', async () => {
      const url = await adapter.getSignedUrl('some/key.jpg');
      expect(url).toBe('https://s3-signed.example.com');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/s3-storage.adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement S3StorageAdapter**

```typescript
// packages/infrastructure/storage/s3-storage.adapter.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';

const UPLOAD_EXPIRY = 3600;
const DOWNLOAD_EXPIRY = 3600;

export class S3StorageAdapter implements IStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly cloudfrontUrl?: string;

  constructor(config: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    cloudfrontUrl?: string;
  }) {
    this.bucket = config.bucketName;
    this.cloudfrontUrl = config.cloudfrontUrl;
    this.client = new S3Client({
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async createPresignedUpload(key: string, contentType: string): Promise<PresignedUploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000',
    });
    const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: UPLOAD_EXPIRY });
    return { uploadUrl, storageKey: key, expiresIn: UPLOAD_EXPIRY };
  }

  async getSignedUrl(key: string): Promise<string> {
    if (this.cloudfrontUrl) {
      return `${this.cloudfrontUrl}/${key}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: DOWNLOAD_EXPIRY });
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const entries = await Promise.all(
      keys.map(async (k) => [k, await this.getSignedUrl(k)] as const),
    );
    return Object.fromEntries(entries);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/s3-storage.adapter.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 5: Commit**

```bash
git add packages/infrastructure/storage/s3-storage.adapter.ts packages/infrastructure/storage/__tests__/s3-storage.adapter.test.ts
git commit -m "feat: add S3StorageAdapter with CloudFront URL support"
```

---

### Task 4: Add StorageBackend type to domain, then StorageAdapterRegistry + RoutedStorageService

> **IMPORTANT**: `StorageBackend` type MUST be defined in `@medical-crm/domain` (not infrastructure or application) to preserve Clean Architecture dependency boundaries. Both infrastructure and application layers import from domain.

**Files:**
- Modify: `packages/domain/src/ports/storage-service.port.ts` (add StorageBackend + IStorageAdapterRegistry)
- Create: `packages/infrastructure/storage/storage-adapter-registry.ts`
- Create: `packages/infrastructure/storage/routed-storage.service.ts`
- Create: `packages/infrastructure/storage/__tests__/storage-adapter-registry.test.ts`
- Create: `packages/infrastructure/storage/__tests__/routed-storage.service.test.ts`

- [ ] **Step 1: Write failing test for StorageAdapterRegistry**

```typescript
// packages/infrastructure/storage/__tests__/storage-adapter-registry.test.ts
import { describe, it, expect, vi } from 'vitest';
import { StorageAdapterRegistry } from '../storage-adapter-registry.js';
import type { IStorageService } from '@medical-crm/domain';

const mockAdapter = (name: string): IStorageService => ({
  createPresignedUpload: vi.fn().mockResolvedValue({ uploadUrl: `${name}-upload`, storageKey: 'k', expiresIn: 600 }),
  getSignedUrl: vi.fn().mockResolvedValue(`${name}-download`),
  getSignedUrls: vi.fn().mockResolvedValue({}),
});

describe('StorageAdapterRegistry', () => {
  const r2 = mockAdapter('r2');
  const r2Beauty = mockAdapter('r2-beauty');
  const s3 = mockAdapter('s3');
  const legacy = mockAdapter('supabase');

  const registry = new StorageAdapterRegistry(
    { 'r2-private': r2, 'r2-materials-beauty': r2Beauty, 's3-materials': s3, 'supabase-legacy': legacy },
    legacy,
  );

  it('gets adapter by backend name', () => {
    expect(registry.get('r2-private')).toBe(r2);
    expect(registry.get('r2-materials-beauty')).toBe(r2Beauty);
    expect(registry.get('s3-materials')).toBe(s3);
  });

  it('throws for unknown backend', () => {
    expect(() => registry.get('unknown' as any)).toThrow('No adapter registered');
  });

  it('routes crm/ CRM media keys to r2-private', () => {
    expect(registry.resolveForDownload('crm/dev/communications/messages/abc/ast_123/file.jpg')).toBe(r2);
  });

  it('routes crm/*/materials-beauty/ keys to r2-materials-beauty', () => {
    expect(registry.resolveForDownload('crm/dev/materials-beauty/surgeon-image/abc/ast_123/file.jpg')).toBe(r2Beauty);
  });

  it('routes crm/*/materials-regular/ keys to s3-materials', () => {
    expect(registry.resolveForDownload('crm/dev/materials-regular/hospital-image/abc/ast_123/file.jpg')).toBe(s3);
  });

  it('routes hospital_photos/ keys to s3-materials', () => {
    expect(registry.resolveForDownload('hospital_photos/public/123/hero.jpg')).toBe(s3);
  });

  it('routes legacy keys to supabase', () => {
    expect(registry.resolveForDownload('documents/case_123/doc_456/file.pdf')).toBe(legacy);
    expect(registry.resolveForDownload('messages/conv_123/uuid-file.jpg')).toBe(legacy);
    expect(registry.resolveForDownload('packages/images/uuid-cover.jpg')).toBe(legacy);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/storage-adapter-registry.test.ts`
Expected: FAIL

- [ ] **Step 2b: Add StorageBackend + IStorageAdapterRegistry to domain port**

```typescript
// packages/domain/src/ports/storage-service.port.ts — ADD after IStorageService:

export type StorageBackend = 'r2-private' | 'r2-materials-beauty' | 's3-materials' | 'supabase-legacy';

export interface IStorageAdapterRegistry {
  get(backend: StorageBackend): IStorageService;
  resolveForDownload(storageKey: string): IStorageService;
}
```

This port is defined in domain so both application layer (`MediaUploadService`) and infrastructure layer (`StorageAdapterRegistry`) can reference it without violating dependency boundaries.

- [ ] **Step 3: Implement StorageAdapterRegistry (implements IStorageAdapterRegistry)**

```typescript
// packages/infrastructure/storage/storage-adapter-registry.ts
import type { IStorageService, StorageBackend, IStorageAdapterRegistry } from '@medical-crm/domain';

export class StorageAdapterRegistry implements IStorageAdapterRegistry {
  private readonly adapters: Map<StorageBackend, IStorageService>;
  private readonly legacyAdapter: IStorageService;

  constructor(
    adapters: Partial<Record<StorageBackend, IStorageService>>,
    legacyAdapter: IStorageService,
  ) {
    this.adapters = new Map(Object.entries(adapters) as [StorageBackend, IStorageService][]);
    this.legacyAdapter = legacyAdapter;
  }

  get(backend: StorageBackend): IStorageService {
    const adapter = this.adapters.get(backend);
    if (!adapter) throw new Error(`No adapter registered for backend: ${backend}`);
    return adapter;
  }

  /** Transitional fallback — routes download by key prefix. Not the final design. */
  resolveForDownload(storageKey: string): IStorageService {
    if (storageKey.startsWith('crm/')) {
      if (storageKey.includes('/materials-beauty/')) return this.get('r2-materials-beauty');
      if (storageKey.includes('/materials-regular/')) return this.get('s3-materials');
      return this.get('r2-private');
    }
    if (storageKey.startsWith('hospital_photos/')) {
      return this.get('s3-materials');
    }
    return this.legacyAdapter;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/storage-adapter-registry.test.ts`
Expected: PASS — all 6 tests

- [ ] **Step 5: Write failing test for RoutedStorageService**

```typescript
// packages/infrastructure/storage/__tests__/routed-storage.service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { RoutedStorageService } from '../routed-storage.service.js';
import { StorageAdapterRegistry } from '../storage-adapter-registry.js';
import type { IStorageService } from '@medical-crm/domain';

const mockAdapter = (name: string): IStorageService => ({
  createPresignedUpload: vi.fn(),
  getSignedUrl: vi.fn().mockResolvedValue(`${name}-url`),
  getSignedUrls: vi.fn().mockImplementation(async (keys: string[]) => {
    const result: Record<string, string> = {};
    for (const k of keys) result[k] = `${name}-url`;
    return result;
  }),
});

describe('RoutedStorageService', () => {
  const r2 = mockAdapter('r2');
  const s3 = mockAdapter('s3');
  const legacy = mockAdapter('supabase');
  const registry = new StorageAdapterRegistry(
    { 'r2-private': r2, 's3-materials': s3, 'supabase-legacy': legacy },
    legacy,
  );
  const service = new RoutedStorageService(registry);

  it('throws on createPresignedUpload', async () => {
    await expect(service.createPresignedUpload('key', 'image/jpeg')).rejects.toThrow(
      'Use MediaUploadService',
    );
  });

  it('routes getSignedUrl for crm/ keys to R2', async () => {
    const url = await service.getSignedUrl('crm/dev/messages/conv/ast/file.jpg');
    expect(r2.getSignedUrl).toHaveBeenCalledWith('crm/dev/messages/conv/ast/file.jpg');
    expect(url).toBe('r2-url');
  });

  it('routes getSignedUrl for legacy keys to supabase', async () => {
    const url = await service.getSignedUrl('documents/case/doc/file.pdf');
    expect(legacy.getSignedUrl).toHaveBeenCalledWith('documents/case/doc/file.pdf');
    expect(url).toBe('supabase-url');
  });

  it('groups batch getSignedUrls by backend', async () => {
    const urls = await service.getSignedUrls([
      'crm/dev/messages/conv/ast/file.jpg',
      'documents/case/doc/file.pdf',
    ]);
    expect(r2.getSignedUrls).toHaveBeenCalledWith(['crm/dev/messages/conv/ast/file.jpg']);
    expect(legacy.getSignedUrls).toHaveBeenCalledWith(['documents/case/doc/file.pdf']);
    expect(Object.keys(urls)).toHaveLength(2);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/routed-storage.service.test.ts`
Expected: FAIL

- [ ] **Step 7: Implement RoutedStorageService**

```typescript
// packages/infrastructure/storage/routed-storage.service.ts
import type { IStorageService, PresignedUploadResult } from '@medical-crm/domain';
import type { StorageAdapterRegistry } from './storage-adapter-registry.js';

export class RoutedStorageService implements IStorageService {
  constructor(private readonly registry: StorageAdapterRegistry) {}

  async createPresignedUpload(_key: string, _contentType: string): Promise<PresignedUploadResult> {
    throw new Error(
      'RoutedStorageService does not support direct uploads. Use MediaUploadService.createUploadIntent() instead.',
    );
  }

  async getSignedUrl(key: string): Promise<string> {
    const adapter = this.registry.resolveForDownload(key);
    return adapter.getSignedUrl(key);
  }

  async getSignedUrls(keys: string[]): Promise<Record<string, string>> {
    if (keys.length === 0) return {};
    const groups = new Map<IStorageService, string[]>();
    for (const key of keys) {
      const adapter = this.registry.resolveForDownload(key);
      const group = groups.get(adapter) ?? [];
      group.push(key);
      groups.set(adapter, group);
    }
    const results: Record<string, string> = {};
    await Promise.all(
      [...groups.entries()].map(async ([adapter, groupKeys]) => {
        const urls = await adapter.getSignedUrls(groupKeys);
        Object.assign(results, urls);
      }),
    );
    return results;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure exec vitest run storage/__tests__/routed-storage.service.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 9: Update infrastructure package exports**

```typescript
// packages/infrastructure/package.json — update "exports" section, add:
"./storage/r2": "./storage/r2-storage.adapter.ts",
"./storage/s3": "./storage/s3-storage.adapter.ts",
"./storage/registry": "./storage/storage-adapter-registry.ts",
"./storage/routed": "./storage/routed-storage.service.ts"
```

- [ ] **Step 10: Run full typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add packages/infrastructure/storage/ packages/infrastructure/package.json
git commit -m "feat: add StorageAdapterRegistry + RoutedStorageService for multi-backend routing"
```

---

### Task 5: Add upload policy types, registry, and all 14 policies

**Files:**
- Create: `packages/application/src/upload-policies/types.ts`
- Create: `packages/application/src/upload-policies/registry.ts`
- Create: `packages/application/src/upload-policies/policy-resolver.ts`
- Create: `packages/application/src/upload-policies/message-attachment.policy.ts`
- Create: `packages/application/src/upload-policies/package-image.policy.ts`
- Create: `packages/application/src/upload-policies/case-document.policy.ts`
- Create: `packages/application/src/upload-policies/ticket-reply-attachment.policy.ts`
- Create: `packages/application/src/upload-policies/faq-attachment.policy.ts`
- Create: `packages/application/src/upload-policies/consultation-recording.policy.ts`
- Create: `packages/application/src/upload-policies/materials-beauty.policies.ts`
- Create: `packages/application/src/upload-policies/materials-regular.policies.ts`
- Create: `packages/application/src/upload-policies/__tests__/registry.test.ts`
- Create: `packages/application/src/upload-policies/__tests__/policy-resolver.test.ts`

- [ ] **Step 1: Create types.ts**

```typescript
// packages/application/src/upload-policies/types.ts

export type UploadFeature =
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  | 'materials_media';

export type UploadPolicyId =
  | 'message_attachment'
  | 'package_image'
  | 'case_document'
  | 'ticket_reply_attachment'
  | 'faq_attachment'
  | 'consultation_recording'
  | 'materials_beauty_hospital_image'
  | 'materials_beauty_hospital_video'
  | 'materials_beauty_testimonial_video'
  | 'materials_beauty_surgeon_image'
  | 'materials_beauty_case_media'
  | 'materials_regular_hospital_image'
  | 'materials_regular_surgeon_image'
  | 'materials_regular_case_media';

// StorageBackend is imported from @medical-crm/domain (defined in storage-service.port.ts)
// Do NOT redefine it here — import it:
import type { StorageBackend } from '@medical-crm/domain';
// StorageBackend = 'r2-private' | 'r2-materials-beauty' | 's3-materials' | 'supabase-legacy'

export type UploadOwnerType =
  | 'conversation'
  | 'package'
  | 'case'
  | 'ticket_reply'
  | 'faq'
  | 'hospital_material'
  | 'consultation';

export interface CreateUploadIntentInput {
  policyId: UploadPolicyId;
  ownerType: UploadOwnerType;
  ownerId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface UploadIntentResult {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
  asset: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    storageKey: string;
  };
}

export interface UploadPolicy {
  policyId: UploadPolicyId;
  feature: UploadFeature;
  backend: StorageBackend;
  keyNamespace: string;
  allowedMimeTypes: string[];
  maxFileSize: number;
  buildStorageKey: (input: CreateUploadIntentInput, assetId: string) => string;
}

/** Sanitize file name for use in storage keys */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.\-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '') || 'file';
}
```

- [ ] **Step 2: Create registry.ts**

```typescript
// packages/application/src/upload-policies/registry.ts
import type { UploadPolicy, UploadPolicyId } from './types.js';

export class UploadPolicyRegistry {
  private readonly policies: Map<UploadPolicyId, UploadPolicy>;

  constructor(policies: UploadPolicy[]) {
    this.policies = new Map(policies.map((p) => [p.policyId, p]));
  }

  get(policyId: UploadPolicyId): UploadPolicy {
    const policy = this.policies.get(policyId);
    if (!policy) throw new Error(`Unknown upload policy: ${policyId}`);
    return policy;
  }
}
```

- [ ] **Step 3: Create all 6 CRM media policy files**

Each policy file exports a single `UploadPolicy` object. The `buildStorageKey` uses `sanitizeFileName` and reads `NODE_ENV` for the `{env}` segment. Example for message-attachment:

```typescript
// packages/application/src/upload-policies/message-attachment.policy.ts
import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const messageAttachmentPolicy: UploadPolicy = {
  policyId: 'message_attachment',
  feature: 'message_attachment',
  backend: 'r2-private',
  keyNamespace: 'communications/messages',
  allowedMimeTypes: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
  ],
  maxFileSize: 20 * 1024 * 1024,
  buildStorageKey: (input, assetId) =>
    `crm/${env}/communications/messages/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
};
```

Follow same pattern for: `package-image.policy.ts` (10MB, image only, `admin/packages`), `case-document.policy.ts` (25MB, `cases/documents`), `ticket-reply-attachment.policy.ts` (20MB, `admin/tickets`), `faq-attachment.policy.ts` (10MB, image+pdf, `admin/chatbot-faqs`), `consultation-recording.policy.ts` (500MB, video/audio, `cases/consultations`).

- [ ] **Step 4: Create materials-beauty.policies.ts (5 policies)**

```typescript
// packages/application/src/upload-policies/materials-beauty.policies.ts
import type { UploadPolicy } from './types.js';
import { sanitizeFileName } from './types.js';

const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

export const materialsBeautyPolicies: UploadPolicy[] = [
  {
    policyId: 'materials_beauty_hospital_image',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/hospital-image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 10 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/hospital-image/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_hospital_video',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/hospital-video',
    allowedMimeTypes: ['video/mp4', 'video/webm'],
    maxFileSize: 200 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/hospital-video/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_testimonial_video',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/testimonial-video',
    allowedMimeTypes: ['video/mp4', 'video/webm'],
    maxFileSize: 200 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/testimonial-video/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_surgeon_image',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/surgeon-image',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxFileSize: 10 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/surgeon-image/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
  {
    policyId: 'materials_beauty_case_media',
    feature: 'materials_media',
    backend: 'r2-materials-beauty',
    keyNamespace: 'materials-beauty/case-media',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'],
    maxFileSize: 50 * 1024 * 1024,
    buildStorageKey: (input, assetId) =>
      `crm/${env}/materials-beauty/case-media/${input.ownerId}/${assetId}/${sanitizeFileName(input.fileName)}`,
  },
];
```

- [ ] **Step 5: Create materials-regular.policies.ts (3 policies)**

Same pattern, but `backend: 's3-materials'` and `materials-regular/` prefix.

- [ ] **Step 6: Create policy-resolver.ts**

```typescript
// packages/application/src/upload-policies/policy-resolver.ts
import type { UploadPolicyId } from './types.js';

const MATERIALS_POLICY_MAP: Record<string, Record<string, UploadPolicyId>> = {
  COSMETIC: {
    hero: 'materials_beauty_hospital_image',
    gallery: 'materials_beauty_hospital_image',
    equipment: 'materials_beauty_hospital_image',
    hospital_video: 'materials_beauty_hospital_video',
    testimonial_video: 'materials_beauty_testimonial_video',
    surgeon: 'materials_beauty_surgeon_image',
    case: 'materials_beauty_case_media',
  },
  REGULAR: {
    hero: 'materials_regular_hospital_image',
    gallery: 'materials_regular_hospital_image',
    equipment: 'materials_regular_hospital_image',
    surgeon: 'materials_regular_surgeon_image',
    case: 'materials_regular_case_media',
  },
};

export function resolveMaterialsPolicyId(
  hospitalType: 'COSMETIC' | 'REGULAR',
  materialKind: string,
): UploadPolicyId {
  const policyId = MATERIALS_POLICY_MAP[hospitalType]?.[materialKind];
  if (!policyId) {
    throw new ValidationError(`Unknown materialKind '${materialKind}' for hospitalType '${hospitalType}'`);
  }
  // NOTE: Import ValidationError from @medical-crm/domain or @medical-crm/utils (whichever defines it)
  return policyId;
}
```

- [ ] **Step 7: Write tests for registry + policy-resolver**

```typescript
// packages/application/src/upload-policies/__tests__/registry.test.ts
import { describe, it, expect } from 'vitest';
import { UploadPolicyRegistry } from '../registry.js';
import { messageAttachmentPolicy } from '../message-attachment.policy.js';

describe('UploadPolicyRegistry', () => {
  const registry = new UploadPolicyRegistry([messageAttachmentPolicy]);

  it('returns policy by policyId', () => {
    const policy = registry.get('message_attachment');
    expect(policy.policyId).toBe('message_attachment');
    expect(policy.backend).toBe('r2-private');
  });

  it('throws for unknown policyId', () => {
    expect(() => registry.get('unknown' as any)).toThrow('Unknown upload policy');
  });
});
```

```typescript
// packages/application/src/upload-policies/__tests__/policy-resolver.test.ts
import { describe, it, expect } from 'vitest';
import { resolveMaterialsPolicyId } from '../policy-resolver.js';

describe('resolveMaterialsPolicyId', () => {
  it('resolves COSMETIC surgeon', () => {
    expect(resolveMaterialsPolicyId('COSMETIC', 'surgeon')).toBe('materials_beauty_surgeon_image');
  });

  it('resolves REGULAR case', () => {
    expect(resolveMaterialsPolicyId('REGULAR', 'case')).toBe('materials_regular_case_media');
  });

  it('throws for unknown materialKind', () => {
    expect(() => resolveMaterialsPolicyId('COSMETIC', 'unknown')).toThrow('Unknown materialKind');
  });

  it('resolves COSMETIC testimonial_video', () => {
    expect(resolveMaterialsPolicyId('COSMETIC', 'testimonial_video')).toBe('materials_beauty_testimonial_video');
  });
});
```

- [ ] **Step 8: Run tests**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/application exec vitest run upload-policies/`
Expected: PASS

- [ ] **Step 9: Run full typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/application/src/upload-policies/
git commit -m "feat: add 14 upload policies, registry, and materials policy resolver"
```

---

### Task 6: Add MediaUploadService

**Files:**
- Create: `packages/application/src/services/media-upload.service.ts`
- Create: `packages/application/src/services/__tests__/media-upload.service.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/application/src/services/__tests__/media-upload.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaUploadService } from '../media-upload.service.js';
import { UploadPolicyRegistry } from '../../upload-policies/registry.js';
import { messageAttachmentPolicy } from '../../upload-policies/message-attachment.policy.js';

const mockRegistry = {
  get: vi.fn().mockReturnValue({
    createPresignedUpload: vi.fn().mockResolvedValue({
      uploadUrl: 'https://upload.example.com',
      storageKey: 'crm/dev/test',
      expiresIn: 600,
    }),
    getSignedUrl: vi.fn(),
    getSignedUrls: vi.fn(),
  }),
  resolveForDownload: vi.fn(),
};

describe('MediaUploadService', () => {
  let service: MediaUploadService;

  beforeEach(() => {
    vi.clearAllMocks();
    const policyRegistry = new UploadPolicyRegistry([messageAttachmentPolicy]);
    service = new MediaUploadService(policyRegistry, mockRegistry as any);
  });

  it('creates upload intent for valid input', async () => {
    const result = await service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'report.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
    });
    expect(result.uploadUrl).toBe('https://upload.example.com');
    expect(result.storageKey).toContain('crm/');
    expect(result.storageKey).toContain('communications/messages');
    expect(result.storageKey).toContain('conv_123');
    expect(result.asset.fileName).toBe('report.pdf');
    expect(result.asset.storageKey).toBe(result.storageKey);
  });

  it('rejects invalid MIME type with ValidationError', async () => {
    await expect(service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'malware.exe',
      fileSize: 1024,
      mimeType: 'application/x-msdownload',
    })).rejects.toThrow(/MIME type not allowed/);
  });

  it('rejects file exceeding max size with ValidationError', async () => {
    await expect(service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'huge.pdf',
      fileSize: 25 * 1024 * 1024, // 25MB > 20MB limit
      mimeType: 'application/pdf',
    })).rejects.toThrow(/exceeds maximum/);
  });

  it('sanitizes file name in storage key', async () => {
    const result = await service.createUploadIntent({
      policyId: 'message_attachment',
      ownerType: 'conversation',
      ownerId: 'conv_123',
      fileName: 'My Report (Final).pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
    });
    expect(result.storageKey).not.toContain(' ');
    expect(result.storageKey).not.toContain('(');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/application exec vitest run services/__tests__/media-upload.service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement MediaUploadService**

```typescript
// packages/application/src/services/media-upload.service.ts
import { randomUUID } from 'node:crypto';
import type { IStorageAdapterRegistry } from '@medical-crm/domain';
import type { UploadPolicyRegistry } from '../upload-policies/registry.js';
import type { CreateUploadIntentInput, UploadIntentResult } from '../upload-policies/types.js';

// NOTE: depends on IStorageAdapterRegistry (domain port), NOT the concrete
// StorageAdapterRegistry from infrastructure. This preserves Clean Architecture.

export class MediaUploadService {
  constructor(
    private readonly policyRegistry: UploadPolicyRegistry,
    private readonly adapterRegistry: IStorageAdapterRegistry,
  ) {}

  async createUploadIntent(input: CreateUploadIntentInput): Promise<UploadIntentResult> {
    const policy = this.policyRegistry.get(input.policyId);

    if (!policy.allowedMimeTypes.includes(input.mimeType)) {
      throw new ValidationError(`MIME type not allowed: ${input.mimeType}. Allowed: ${policy.allowedMimeTypes.join(', ')}`);
    }

    if (input.fileSize > policy.maxFileSize) {
      throw new ValidationError(
        `File size ${input.fileSize} exceeds maximum ${policy.maxFileSize} for policy ${policy.policyId}`,
      );
    }

    const assetId = randomUUID();
    const storageKey = policy.buildStorageKey(input, assetId);
    const adapter = this.adapterRegistry.get(policy.backend);
    const presigned = await adapter.createPresignedUpload(storageKey, input.mimeType);

    return {
      uploadUrl: presigned.uploadUrl,
      storageKey,
      expiresIn: presigned.expiresIn,
      asset: {
        fileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        storageKey,
      },
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/application exec vitest run services/__tests__/media-upload.service.test.ts`
Expected: PASS — all 4 tests

- [ ] **Step 5: Run full typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/application/src/services/media-upload.service.ts packages/application/src/services/__tests__/media-upload.service.test.ts
git commit -m "feat: add MediaUploadService with policy validation and key generation"
```

---

## Chunk 2: Composition Root + Route Refactoring (Atomic Swap)

### Task 7: Wire composition root — ATOMIC with route refactors

This task MUST be done atomically. The `RoutedStorageService` blocks `createPresignedUpload()`, so all routes that call `svc.storage.createPresignedUpload()` must be refactored in the same commit.

**Files:**
- Modify: `apps/api/src/composition-root.ts:203,224,476,551-586`
- Modify: `apps/api/src/routes/messages.routes.ts:75-96`
- Modify: `apps/api/src/routes/packages.routes.ts:65-88`
- Modify: `packages/application/src/use-cases/documents/upload-document.use-case.ts`
- Modify: `apps/api/src/routes/documents.routes.ts:24-47`

- [ ] **Step 0: Update package exports for application + infrastructure**

Before importing in composition root, ensure the packages export the new modules:

```typescript
// packages/application/package.json — add to "exports":
"./upload-policies": "./src/upload-policies/index.ts",
"./services/media-upload": "./src/services/media-upload.service.ts"
```

Create the barrel export file:
```typescript
// packages/application/src/upload-policies/index.ts
export { UploadPolicyRegistry } from './registry.js';
export { resolveMaterialsPolicyId } from './policy-resolver.js';
export { messageAttachmentPolicy } from './message-attachment.policy.js';
export { packageImagePolicy } from './package-image.policy.js';
export { caseDocumentPolicy } from './case-document.policy.js';
export { ticketReplyAttachmentPolicy } from './ticket-reply-attachment.policy.js';
export { faqAttachmentPolicy } from './faq-attachment.policy.js';
export { consultationRecordingPolicy } from './consultation-recording.policy.js';
export { materialsBeautyPolicies } from './materials-beauty.policies.js';
export { materialsRegularPolicies } from './materials-regular.policies.js';
export type * from './types.js';
```

- [ ] **Step 1: Update composition-root.ts imports and adapter setup**

At the top of `composition-root.ts`, add imports using workspace package paths (NOT relative `../../../` paths):

```typescript
import { R2StorageAdapter } from '@medical-crm/infrastructure/storage/r2';
import { S3StorageAdapter } from '@medical-crm/infrastructure/storage/s3';
import { StorageAdapterRegistry } from '@medical-crm/infrastructure/storage/registry';
import { RoutedStorageService } from '@medical-crm/infrastructure/storage/routed';
import { MediaUploadService } from '@medical-crm/application/services/media-upload';
import {
  UploadPolicyRegistry,
  messageAttachmentPolicy,
  packageImagePolicy,
  caseDocumentPolicy,
  ticketReplyAttachmentPolicy,
  faqAttachmentPolicy,
  consultationRecordingPolicy,
  materialsBeautyPolicies,
  materialsRegularPolicies,
} from '@medical-crm/application/upload-policies';
```

- [ ] **Step 2: Replace storage adapter instantiation at line 476**

Replace:
```typescript
const storage = new SupabaseStorageAdapter(mainSupabase);
```

With:
```typescript
const supabaseLegacyAdapter = new SupabaseStorageAdapter(mainSupabase);

// CRM private media (signed URLs)
const r2Adapter = new R2StorageAdapter({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  bucketName: env.R2_BUCKET_NAME,
});

// Beauty hospital materials — same R2 account, different bucket, public URL
const r2MaterialsBeautyAdapter = new R2StorageAdapter({
  accountId: env.R2_ACCOUNT_ID,
  accessKeyId: env.R2_ACCESS_KEY_ID,
  secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  bucketName: env.R2_MATERIALS_BEAUTY_BUCKET_NAME,
  publicUrl: env.R2_MATERIALS_BEAUTY_PUBLIC_URL,
});

// Regular hospital materials (S3 + CloudFront)
const s3Adapter = new S3StorageAdapter({
  region: env.AWS_REGION,
  accessKeyId: env.AWS_ACCESS_KEY_ID,
  secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
  bucketName: env.AWS_S3_BUCKET,
  cloudfrontUrl: env.AWS_CLOUDFRONT_URL,
});

const storageAdapterRegistry = new StorageAdapterRegistry(
  {
    'r2-private': r2Adapter,
    'r2-materials-beauty': r2MaterialsBeautyAdapter,
    's3-materials': s3Adapter,
    'supabase-legacy': supabaseLegacyAdapter,
  },
  supabaseLegacyAdapter,
);

const routedStorageService = new RoutedStorageService(storageAdapterRegistry);

const uploadPolicyRegistry = new UploadPolicyRegistry([
  messageAttachmentPolicy,
  packageImagePolicy,
  caseDocumentPolicy,
  ticketReplyAttachmentPolicy,
  faqAttachmentPolicy,
  consultationRecordingPolicy,
  ...materialsBeautyPolicies,
  ...materialsRegularPolicies,
]);

const mediaUploadService = new MediaUploadService(uploadPolicyRegistry, storageAdapterRegistry);
```

- [ ] **Step 3: Update services object — replace `storage` with `routedStorageService` + add `mediaUpload`**

In the `_services` assignment (line 551+), change:
- `storage` → `routedStorageService` (same variable name `storage` in the object, pointing to `routedStorageService`)
- Add `mediaUpload: mediaUploadService`
- Update `UploadDocumentUseCase` constructor to no longer pass `storage` (see step 5)

```typescript
_services = {
  crmDb, mainSupabase, chinaSupabase,
  caseRepo, documentRepo, progressRepo, hospitalRepo, patientRepo,
  storage: routedStorageService,
  mediaUpload: mediaUploadService,
  // ... rest unchanged, but uploadDocument needs fix (step 5)
```

- [ ] **Step 4: Refactor messages.routes.ts upload handler (lines 75-96)**

Replace lines 83-95 with:

```typescript
  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'message_attachment',
    ownerType: 'conversation',
    ownerId: id,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  return c.json({
    upload: {
      uploadUrl: result.uploadUrl,
      storageKey: result.storageKey,
      expiresIn: result.expiresIn,
    },
    asset: result.asset,
  }, 201);
  // NOTE: previously returned `attachment` key. This is a breaking change.
  // If frontend compat is needed, add `attachment: result.asset` alongside `asset`.
```

Delete the `safeFileName` and `storageKey` manual construction and `svc.storage.createPresignedUpload()` call.

- [ ] **Step 5: Refactor packages.routes.ts upload handler (lines 65-88)**

Replace lines 75-87 with:

```typescript
  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'package_image',
    ownerType: 'package',
    ownerId: `draft_${randomUUID()}`,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  return c.json({
    upload: {
      uploadUrl: result.uploadUrl,
      storageKey: result.storageKey,
      expiresIn: result.expiresIn,
    },
    asset: result.asset,
  }, 201);
```

- [ ] **Step 6: Refactor UploadDocumentUseCase — remove IStorageService dependency**

Update `packages/application/src/use-cases/documents/upload-document.use-case.ts`:

1. Remove `IStorageService` import and constructor parameter
2. Add `storageKey: string` to the input interface
3. Remove the `createPresignedUpload()` call and storage key generation
4. Change return type from `Promise<{ upload: PresignedUploadResult; documentId: string }>` to `Promise<{ documentId: string }>`
5. Keep all Document entity creation and CaseProgress recording logic unchanged

Updated constructor signature:
```typescript
constructor(
  private readonly documentRepo: IDocumentRepository,
  private readonly caseRepo: ICaseRepository,
  private readonly progressRepo: ICaseProgressRepository,
  // storage removed
) {}
```

Updated input (keep `actor` as second arg — matches existing `execute(input, actor)` pattern):
```typescript
interface UploadDocumentInput {
  caseId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  documentType: string;
  sensitivity: string;
  language: string;
  storageKey: string;  // NEW — provided by route handler via MediaUploadService
}
```

- [ ] **Step 7: Update documents.routes.ts — split upload intent + entity save**

```typescript
// apps/api/src/routes/documents.routes.ts — updated handler
app.openapi(uploadDocumentRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  // Step 1: Get presigned upload URL via MediaUploadService
  const uploadResult = await svc.mediaUpload.createUploadIntent({
    policyId: 'case_document',
    ownerType: 'case',
    ownerId: caseId,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  // Step 2: Save document entity with the generated storageKey
  // NOTE: execute(input, actor) — actor is second arg, matching existing pattern
  const { documentId } = await svc.uploadDocument.execute(
    { ...body, caseId, storageKey: uploadResult.storageKey },
    actor,
  );

  return c.json({
    upload: {
      uploadUrl: uploadResult.uploadUrl,
      storageKey: uploadResult.storageKey,
      expiresIn: uploadResult.expiresIn,
    },
    asset: uploadResult.asset,
    documentId,
  }, 201);
});
```

- [ ] **Step 7b: Update composition root — remove `storage` from UploadDocumentUseCase constructor**

Line 564 of composition-root.ts currently:
```typescript
uploadDocument: new UploadDocumentUseCase(documentRepo, caseRepo, progressRepo, storage),
```
Change to:
```typescript
uploadDocument: new UploadDocumentUseCase(documentRepo, caseRepo, progressRepo),
```

- [ ] **Step 7c: Update documents route tests**

In `apps/api/src/__tests__/documents.routes.test.ts`:
1. Add `mediaUpload: { createUploadIntent: vi.fn().mockResolvedValue({...}) }` to `mockServices`
2. Update response assertions to match new shape (`upload.uploadUrl` instead of `upload.signedUrl`, etc.)
3. Update `uploadDocument.execute` mock return to `{ documentId: 'doc-id' }` (no longer includes `upload`)

- [ ] **Step 8: Update AppServices interface in composition-root.ts**

Add `mediaUpload: MediaUploadService` to the interface. Keep `storage: IStorageService` (now pointing to RoutedStorageService).

- [ ] **Step 9: Run all tests**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run test`
Expected: Existing tests may need mock updates for the new `mediaUpload` service. Fix any that fail.

- [ ] **Step 10: Run typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/composition-root.ts apps/api/src/routes/messages.routes.ts apps/api/src/routes/packages.routes.ts packages/application/src/use-cases/documents/ apps/api/src/routes/documents.routes.ts
git commit -m "feat: wire MediaUploadService + RoutedStorageService, refactor existing upload routes"
```

---

## Chunk 3: New Upload Endpoints

### Task 8: Add ticket attachment upload endpoint

**Files:**
- Modify: `apps/api/src/routes/tickets.routes.ts`
- Create: `apps/api/src/__tests__/ticket-upload.routes.test.ts`

- [ ] **Step 1: Write failing test**

Test `POST /api/v2/tickets/{id}/attachments/upload` returns 201 with upload + asset shape. Mock `mediaUpload.createUploadIntent`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Add upload route to tickets.routes.ts**

```typescript
// Add after existing ticket routes
const initTicketAttachmentUploadRoute = createRoute({
  method: 'post',
  path: '/api/v2/tickets/{id}/attachments/upload',
  request: {
    params: ticketIdParamSchema,
    body: {
      content: { 'application/json': { schema: uploadInitSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Attachment upload initialized' } },
});

app.openapi(initTicketAttachmentUploadRoute, async (c) => {
  const { id } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  // Verify ticket access
  await svc.getTicket.execute(id, actor);

  const result = await svc.mediaUpload.createUploadIntent({
    policyId: 'ticket_reply_attachment',
    ownerType: 'ticket_reply',
    ownerId: id,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  return c.json({
    upload: { uploadUrl: result.uploadUrl, storageKey: result.storageKey, expiresIn: result.expiresIn },
    asset: result.asset,
  }, 201);
});
```

- [ ] **Step 4: Add shared uploadInitSchema to validation package if not existing**

```typescript
// packages/shared/validation/src/upload.schema.ts
import { z } from 'zod';

export const uploadInitSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});
```

- [ ] **Step 5: Run test to verify it passes**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add ticket attachment upload-init endpoint"
```

---

### Task 9: Add FAQ attachment upload endpoint + migration

**Files:**
- Create: `packages/infrastructure/database/migrations/0XX_faq_attachments.sql`
- Modify: `packages/infrastructure/database/schema/schema.ts` (add attachments column to chatbot_faq_items)
- Modify: `packages/domain/src/entities/chatbot-faq-item.entity.ts` (add attachments property)
- Modify: `packages/infrastructure/database/repositories/drizzle-chatbot-faq.repository.ts`
- Modify: `packages/application/src/dtos/chatbot-faq.dto.ts`
- Modify: `packages/application/src/mappers/chatbot-faq.mapper.ts`
- Modify: `apps/api/src/routes/chatbot-faq.routes.ts`

- [ ] **Step 1: Create migration**

```sql
-- packages/infrastructure/database/migrations/0XX_faq_attachments.sql
ALTER TABLE chatbot_faq_items ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
```

- [ ] **Step 2: Run migration**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter @medical-crm/infrastructure run db:migrate`

- [ ] **Step 3: Update Drizzle schema, entity, repository, DTO, mapper to include attachments field**

- [ ] **Step 4: Add upload route to chatbot-faq.routes.ts**

Same pattern as ticket upload, with `policyId: 'faq_attachment'`, `ownerType: 'faq'`, `ownerId: faqId`.

- [ ] **Step 5: Write tests and verify pass**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add FAQ attachments field + upload-init endpoint"
```

---

### Task 10: Add consultation recording upload endpoint

**Files:**
- Modify: `apps/api/src/routes/consultations.routes.ts`

- [ ] **Step 1: Write failing test**

- [ ] **Step 2: Add upload route**

Same pattern, `policyId: 'consultation_recording'`, `ownerType: 'consultation'`, `ownerId: consultationId`.

- [ ] **Step 3: Run test to verify it passes**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add consultation recording upload-init endpoint"
```

---

### Task 11: Add materials upload endpoint

**Files:**
- Modify: `apps/api/src/routes/materials.routes.ts`

- [ ] **Step 1: Write failing test**

Test that `POST /api/v2/hospitals/{hospitalId}/materials/upload` with `{ materialKind: 'surgeon', fileName, fileSize, mimeType }` returns 201. Mock `resolveHospitalType` to return `'COSMETIC'`.

- [ ] **Step 2: Add upload route**

```typescript
// Add to materials.routes.ts
const materialsUploadInitSchema = z.object({
  materialKind: z.string().min(1),
  fileName: z.string().min(1),
  fileSize: z.number().positive(),
  mimeType: z.string().min(1),
});

// Route handler resolves hospitalType server-side, then:
const policyId = resolveMaterialsPolicyId(hospitalType, body.materialKind);
const result = await svc.mediaUpload.createUploadIntent({
  policyId,
  ownerType: 'hospital_material',
  ownerId: hospitalId,
  fileName: body.fileName,
  fileSize: body.fileSize,
  mimeType: body.mimeType,
});
```

- [ ] **Step 3: Run test to verify it passes**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add materials upload-init endpoint with hospital-type routing"
```

---

## Chunk 4: Final Verification

### Task 12: Full test suite + typecheck

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run test`
Expected: All tests pass. Fix any failures.

- [ ] **Step 2: Run full typecheck**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm -r run typecheck`
Expected: All packages pass.

- [ ] **Step 3: Verify .env rename**

Confirm `.env` has `R2_ACCOUNT_ID` (not `CLOUDFLARE_ACCOUNT_ID`) and `R2_BUCKET_NAME`.

- [ ] **Step 4: Smoke test — start API server**

Run: `cd /Users/haowang/Desktop/medora-health-beauty/medical-crm-v2 && pnpm --filter api run dev`
Expected: Server starts without env validation errors.

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git commit -m "fix: address test and typecheck issues from unified upload migration"
```
