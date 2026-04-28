import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { assertHospitalCaseAccess, hasHospitalCaseAccess, toActor } from '@medical-crm/application';
import type { Session } from '@medical-crm/infrastructure/auth';
import { uploadDocumentSchema } from '@medical-crm/validation';
import { ValidationError } from '@medical-crm/utils';
import { access, readdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { getServices } from '../composition-root.js';

const app = new OpenAPIHono();

// ---------------------------------------------------------------------------
// Param schemas
// ---------------------------------------------------------------------------
const caseIdParamSchema = z.object({
  caseId: z.string().uuid(),
});

const docIdParamSchema = z.object({
  caseId: z.string().uuid(),
  docId: z.string().uuid(),
});

const notifyDocumentTypes = ['INVITATION', 'DIAGNOSIS', 'QUOTE'] as const;
type NotifyDocumentType = typeof notifyDocumentTypes[number];
const notifyDocumentBodySchema = z.object({
  hospitalId: z.string().uuid().optional(),
}).strict();

const translateDocumentSchema = z.object({
  inputPath: z.string().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  fileName: z.string().min(1).optional(),
  targetLanguage: z.string().min(2),
  sourceLanguage: z.string().min(2).optional(),
  outputMode: z.enum(['mono', 'dual', 'both']).default('mono'),
}).superRefine((value, ctx) => {
  if (!value.inputPath && !value.sourceUrl) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['inputPath'],
      message: 'Either inputPath or sourceUrl is required',
    });
  }
});

const translatedFileQuerySchema = z.object({
  path: z.string().min(1),
});

function getBabelDocConfig() {
  const root = process.env['BABELDOC_DIR']
    ?? resolve(process.cwd(), '../../BabelDOC');
  const pythonBin = process.env['BABELDOC_PYTHON_BIN']
    ?? resolve(root, '.venv/bin/python');
  return {
    root,
    pythonBin,
    model: process.env['BABELDOC_OPENAI_MODEL'] ?? process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
    baseUrl: process.env['BABELDOC_OPENAI_BASE_URL'] ?? process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',
    apiKey: process.env['BABELDOC_OPENAI_API_KEY'] ?? process.env['OPENAI_API_KEY'] ?? '',
  };
}

async function resolvePdfTranslationInput(input: z.infer<typeof translateDocumentSchema>): Promise<string> {
  if (input.inputPath) {
    if (extname(input.inputPath).toLowerCase() !== '.pdf') {
      throw new ValidationError('PDF translation preview currently supports PDF inputs only. Image translation is not wired yet.');
    }
    await access(input.inputPath, fsConstants.R_OK);
    return input.inputPath;
  }

  if (!input.sourceUrl) {
    throw new ValidationError('Either inputPath or sourceUrl is required');
  }

  const fileName = input.fileName?.trim() || 'document.pdf';
  if (extname(fileName).toLowerCase() !== '.pdf') {
    throw new ValidationError('PDF translation preview currently supports PDF inputs only. Image translation is not wired yet.');
  }

  const response = await fetch(input.sourceUrl);
  if (!response.ok) {
    throw new ValidationError(`Failed to download source PDF: ${response.status}`);
  }

  const tempDir = await mkdtemp(join(tmpdir(), 'pdftranslate-source-'));
  const localPath = join(tempDir, fileName);
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(localPath, buffer);
  return localPath;
}

async function collectOutputFiles(rootDir: string, baseDir = rootDir): Promise<Array<{ fileName: string; path: string }>> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(entries
    .filter((entry) => !entry.name.startsWith('.'))
    .map(async (entry) => {
      const absolutePath = join(rootDir, entry.name);
      if (entry.isDirectory()) {
        return collectOutputFiles(absolutePath, baseDir);
      }
      return [{
        fileName: absolutePath.slice(baseDir.length + 1),
        path: absolutePath,
      }];
    }));

  return files.flat().sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function isNotifyDocumentType(value: string): value is NotifyDocumentType {
  return notifyDocumentTypes.includes(value as NotifyDocumentType);
}

function buildDocumentNotificationCopy(documentType: NotifyDocumentType): {
  subject: string;
  messagePreview: string;
} {
  if (documentType === 'DIAGNOSIS') {
    return {
      subject: 'Your diagnosis document is available',
      messagePreview: 'Your hospital uploaded a diagnosis document for your case.',
    };
  }

  if (documentType === 'QUOTE') {
    return {
      subject: 'Your treatment quote is available',
      messagePreview: 'Your hospital uploaded a treatment quote for your case.',
    };
  }

  return {
    subject: 'Your invitation letter is available',
    messagePreview: 'Your hospital uploaded a medical invitation letter for your case.',
  };
}

async function readNotifyDocumentBody(request: Request): Promise<
  { ok: true; hospitalId?: string } | { ok: false; error: string }
> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return { ok: true };
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = notifyDocumentBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid document notification request body' };
  }

  return parsed.data.hospitalId ? { ok: true, hospitalId: parsed.data.hospitalId } : { ok: true };
}

async function runBabelDocTranslation(input: z.infer<typeof translateDocumentSchema>) {
  const config = getBabelDocConfig();
  await access(config.pythonBin, fsConstants.X_OK);

  if (!config.apiKey) {
    throw new ValidationError('BABELDOC_OPENAI_API_KEY or OPENAI_API_KEY is required');
  }

  const inputPath = await resolvePdfTranslationInput(input);
  const outputDir = await mkdtemp(join(tmpdir(), 'babeldoc-'));
  const args = [
    '-m',
    'babeldoc.main',
    '--files', inputPath,
    '--lang-out', input.targetLanguage,
    '--output', outputDir,
    '--openai',
    '--openai-model', config.model,
    '--openai-base-url', config.baseUrl,
    '--openai-api-key', config.apiKey,
  ];

  if (input.sourceLanguage) {
    args.push('--lang-in', input.sourceLanguage);
  }
  if (input.outputMode === 'mono') {
    args.push('--no-dual');
  } else if (input.outputMode === 'dual') {
    args.push('--no-mono');
  }

  const normalizeTranslationError = (raw: string): string => {
    const message = raw.replace(/\s+/g, ' ').trim();
    if (/contains no paragraphs|no paragraphs/i.test(message)) {
      return 'BabelDOC could not detect translatable paragraphs in this PDF.';
    }
    return message || 'BabelDOC translation failed';
  };

  const result = await new Promise<{ stdout: string; stderr: string }>((resolvePromise, rejectPromise) => {
    const child = spawn(config.pythonBin, args, {
      cwd: config.root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      rejectPromise(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      rejectPromise(new Error(normalizeTranslationError(stderr || stdout || `BabelDOC exited with code ${code}`)));
    });
  });

  const outputFiles = await collectOutputFiles(outputDir);
  if (outputFiles.length === 0) {
    throw new ValidationError(
      `BabelDOC completed but produced no output files for targetLanguage=${input.targetLanguage}. stdout=${result.stdout.slice(-500)} stderr=${result.stderr.slice(-500)}`,
    );
  }

  return {
    inputFileName: basename(inputPath),
    outputDir,
    outputFiles,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

// ---------------------------------------------------------------------------
// 1. POST /api/v2/cases/:caseId/documents — UploadDocument
// ---------------------------------------------------------------------------
const uploadDocumentRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/documents',
  request: {
    params: caseIdParamSchema,
    body: {
      content: { 'application/json': { schema: uploadDocumentSchema } },
      required: true,
    },
  },
  responses: { 201: { description: 'Document upload initiated' } },
});

app.openapi(uploadDocumentRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();

  // Get upload URL
  const uploadResult = await svc.mediaUpload.createUploadIntent({
    policyId: 'case_document',
    ownerType: 'case',
    ownerId: caseId,
    fileName: body.fileName,
    fileSize: body.fileSize,
    mimeType: body.mimeType,
  });

  // Save document entity
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

// ---------------------------------------------------------------------------
// 1a. POST /api/v2/cases/:caseId/documents/:docId/notify-patient — NotifyPatientDocumentAvailable
// ---------------------------------------------------------------------------
const notifyPatientDocumentAvailableRoute = createRoute({
  method: 'post',
  path: '/api/v2/cases/{caseId}/documents/{docId}/notify-patient',
  request: {
    params: docIdParamSchema,
  },
  responses: { 204: { description: 'Patient notification dispatched (best effort)' } },
});

app.openapi(notifyPatientDocumentAvailableRoute, async (c) => {
  const { caseId, docId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const body = await readNotifyDocumentBody(c.req.raw);
  if (!body.ok) {
    return c.json({ error: body.error }, 400);
  }

  if (actor.role !== 'HOSPITAL' && actor.role !== 'ADMIN') {
    return c.json({ error: 'Only admins and hospital users can notify patients about uploaded case documents' }, 403);
  }

  if (actor.role === 'HOSPITAL' && !actor.hospitalId) {
    return c.json({ error: 'Hospital user is missing hospital context' }, 403);
  }

  const caseEntity = await svc.caseRepo.findById(caseId);
  if (!caseEntity) {
    return c.json({ error: 'Case not found' }, 404);
  }
  if (actor.role === 'HOSPITAL') {
    await assertHospitalCaseAccess(caseEntity, actor.hospitalId, svc.chcRepo);
  }

  const doc = await svc.documentRepo.findById(docId);
  if (!doc || doc.caseId !== caseId || doc.status === 'DELETED') {
    return c.json({ error: 'Document not found' }, 404);
  }

  if (!isNotifyDocumentType(doc.documentType)) {
    return c.body(null, 204);
  }

  try {
    const patient = await svc.patientRepo.findById(caseEntity.patientId);
    const explicitHospitalId = actor.role === 'ADMIN' ? body.hospitalId : undefined;
    if (explicitHospitalId) {
      const hospital = await svc.hospitalRepo.findById(explicitHospitalId);
      if (!hospital) {
        return c.json({ error: 'Hospital not found' }, 404);
      }

      const hasAccess = await hasHospitalCaseAccess(caseEntity, explicitHospitalId, svc.chcRepo);
      if (!hasAccess) {
        return c.json({ error: 'Hospital is not associated with this case' }, 403);
      }
    }

    const hospitalId = actor.role === 'HOSPITAL' ? actor.hospitalId : explicitHospitalId ?? null;
    const channel = hospitalId ? 'HOSPITAL_PATIENT' : 'ADMIN_PATIENT';
    const copy = buildDocumentNotificationCopy(doc.documentType);

    await svc.notifyPatientOfCaseUpdate.execute({
      caseId,
      patientId: caseEntity.patientId,
      site: patient?.site ?? 'china',
      subject: copy.subject,
      messagePreview: copy.messagePreview,
      dedupeKey: `document:${docId}`,
      channel,
      hospitalId,
      sourceKind: 'document',
      sourceId: docId,
      resolveConversationId: async () => {
        const conversation = await svc.createConversation.execute({
          category: channel,
          caseId,
          ...(hospitalId ? { hospitalId } : {}),
        }, actor);
        return conversation.id;
      },
    });
  } catch (error) {
    console.warn('Failed to notify patient about a case document:', error);
  }

  return c.body(null, 204);
});

// ---------------------------------------------------------------------------
// 1b. POST /api/v2/documents/translate — TranslateDocumentWithBabelDOC
// ---------------------------------------------------------------------------
const translateDocumentRoute = createRoute({
  method: 'post',
  path: '/api/v2/documents/translate',
  request: {
    body: {
      content: { 'application/json': { schema: translateDocumentSchema } },
      required: true,
    },
  },
  responses: { 200: { description: 'Translated document output paths' } },
});

app.openapi(translateDocumentRoute, async (c) => {
  const body = c.req.valid('json');
  const actor = toActor(c.get('session') as Session);

  if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
    return c.json({ error: 'Only admin and hospital users can translate documents' }, 403);
  }

  console.info('[debug][documents.translate] enter', {
    actorRole: actor.role,
    inputPath: body.inputPath ?? null,
    sourceUrl: body.sourceUrl ?? null,
    fileName: body.fileName ?? null,
    targetLanguage: body.targetLanguage,
    outputMode: body.outputMode,
  });

  try {
    const result = await runBabelDocTranslation(body);
    console.info('[debug][documents.translate] success', {
      inputFileName: result.inputFileName,
      outputDir: result.outputDir,
      outputCount: result.outputFiles.length,
    });
    return c.json(result, 200);
  } catch (error) {
    console.error('[debug][documents.translate] failed', {
      inputPath: body.inputPath ?? null,
      sourceUrl: body.sourceUrl ?? null,
      fileName: body.fileName ?? null,
      targetLanguage: body.targetLanguage,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
});

// ---------------------------------------------------------------------------
// 1c. GET /api/v2/documents/translate/file?path=... — GetTranslatedDocumentFile
// ---------------------------------------------------------------------------
const translatedFileRoute = createRoute({
  method: 'get',
  path: '/api/v2/documents/translate/file',
  request: {
    query: translatedFileQuerySchema,
  },
  responses: { 200: { description: 'Translated file bytes' } },
});

app.openapi(translatedFileRoute, async (c) => {
  const { path } = c.req.valid('query');
  const actor = toActor(c.get('session') as Session);

  if (actor.role !== 'ADMIN' && actor.role !== 'HOSPITAL') {
    return c.json({ error: 'Only admin and hospital users can access translated documents' }, 403);
  }

  const resolvedPath = resolve(path);
  const allowedRoot = tmpdir();
  if (!resolvedPath.startsWith(resolve(allowedRoot)) || !resolvedPath.includes('/babeldoc-')) {
    throw new ValidationError('Invalid translated document path');
  }

  await access(resolvedPath, fsConstants.R_OK);
  const file = await readFile(resolvedPath);
  const contentType = extname(resolvedPath).toLowerCase() === '.pdf'
    ? 'application/pdf'
    : 'application/octet-stream';

  return new Response(file, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${basename(resolvedPath)}"`,
      'Cache-Control': 'no-store',
    },
  });
});

// ---------------------------------------------------------------------------
// 2. GET /api/v2/cases/:caseId/documents — ListDocuments
// ---------------------------------------------------------------------------
const listDocumentsRoute = createRoute({
  method: 'get',
  path: '/api/v2/cases/{caseId}/documents',
  request: {
    params: caseIdParamSchema,
  },
  responses: { 200: { description: 'List of documents for the case' } },
});

app.openapi(listDocumentsRoute, async (c) => {
  const { caseId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  const result = await svc.listDocuments.execute(caseId, actor);
  return c.json(result, 200);
});

// ---------------------------------------------------------------------------
// 3. DELETE /api/v2/cases/:caseId/documents/:docId — DeleteDocument
// ---------------------------------------------------------------------------
const deleteDocumentRoute = createRoute({
  method: 'delete',
  path: '/api/v2/cases/{caseId}/documents/{docId}',
  request: {
    params: docIdParamSchema,
  },
  responses: { 204: { description: 'Document deleted' } },
});

app.openapi(deleteDocumentRoute, async (c) => {
  const { caseId, docId } = c.req.valid('param');
  const actor = toActor(c.get('session') as Session);
  const svc = getServices();
  await svc.deleteDocument.execute(caseId, docId, actor);
  return c.body(null, 204);
});

export default app;
