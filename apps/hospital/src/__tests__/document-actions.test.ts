import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteCaseDocument, uploadCaseDocument } from '../actions/document-actions';

describe('document actions', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  it('initializes a case document upload and PUTs the file to the signed URL', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        upload: {
          uploadUrl: 'https://storage.example.com/upload',
          storageKey: 'cases/case-1/report.pdf',
        },
        asset: {
          storageKey: 'cases/case-1/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          fileSize: 3,
        },
        documentId: 'doc-1',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 })));

    const file = new File(['abc'], 'report.pdf', { type: 'application/pdf' });

    const result = await uploadCaseDocument('case-1', file, 'DIAGNOSIS');

    expect(global.fetch).toHaveBeenNthCalledWith(1, '/api/cases/case-1/documents', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }));

    const initRequest = vi.mocked(global.fetch).mock.calls[0]?.[1];
    expect(initRequest && typeof initRequest === 'object' && 'body' in initRequest ? initRequest.body : null).toBe(
      JSON.stringify({
        fileName: 'report.pdf',
        fileSize: 3,
        mimeType: 'application/pdf',
        documentType: 'DIAGNOSIS',
        sensitivity: 'PHI_HIGH',
        language: 'en',
      }),
    );

    expect(global.fetch).toHaveBeenNthCalledWith(2, 'https://storage.example.com/upload', expect.objectContaining({
      method: 'PUT',
      body: file,
    }));

    expect(result).toEqual({
      storageKey: 'cases/case-1/report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      fileSize: 3,
      documentId: 'doc-1',
    });
  });

  it('notifies the patient only after an invitation upload succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        upload: {
          uploadUrl: 'https://storage.example.com/upload',
          storageKey: 'cases/case-1/invitation.pdf',
        },
        asset: {
          storageKey: 'cases/case-1/invitation.pdf',
          fileName: 'invitation.pdf',
          mimeType: 'application/pdf',
          fileSize: 4,
        },
        documentId: 'doc-invitation-1',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));

    const file = new File(['pdf'], 'invitation.pdf', { type: 'application/pdf' });

    await uploadCaseDocument('case-1', file, 'INVITATION');

    expect(global.fetch).toHaveBeenNthCalledWith(3, '/api/cases/case-1/documents/doc-invitation-1/notify-patient', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }));
  });

  it('allows uploads to succeed even if the invitation notification fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        upload: {
          uploadUrl: 'https://storage.example.com/upload',
          storageKey: 'cases/case-1/invitation.pdf',
        },
        asset: {
          storageKey: 'cases/case-1/invitation.pdf',
          fileName: 'invitation.pdf',
          mimeType: 'application/pdf',
          fileSize: 4,
        },
        documentId: 'doc-invitation-1',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'mail down' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const file = new File(['pdf'], 'invitation.pdf', { type: 'application/pdf' });

    const result = await uploadCaseDocument('case-1', file, 'INVITATION');

    expect(result.documentId).toBe('doc-invitation-1');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('removes the pending document record when the binary upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        upload: {
          uploadUrl: 'https://storage.example.com/upload',
          storageKey: 'cases/case-1/invitation.pdf',
        },
        asset: {
          storageKey: 'cases/case-1/invitation.pdf',
          fileName: 'invitation.pdf',
          mimeType: 'application/pdf',
          fileSize: 4,
        },
        documentId: 'doc-invitation-1',
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 })));

    const file = new File(['pdf'], 'invitation.pdf', { type: 'application/pdf' });

    await expect(uploadCaseDocument('case-1', file, 'INVITATION')).rejects.toThrow('Upload failed with status 500');
    expect(global.fetch).toHaveBeenNthCalledWith(3, '/api/cases/case-1/documents/doc-invitation-1', expect.objectContaining({
      method: 'DELETE',
      credentials: 'same-origin',
    }));
  });

  it('deletes an uploaded case document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    await deleteCaseDocument('case-1', 'doc-1');

    expect(global.fetch).toHaveBeenCalledWith('/api/cases/case-1/documents/doc-1', expect.objectContaining({
      method: 'DELETE',
      credentials: 'same-origin',
    }));
  });
});
