'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist';
import { cn } from '../lib/cn';
import { AsyncStatusCard } from './async-status-card';

const workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

if (typeof window !== 'undefined' && GlobalWorkerOptions.workerSrc !== workerSrc) {
  GlobalWorkerOptions.workerSrc = workerSrc;
}

export interface PdfPreviewProps {
  url: string;
  title: string;
  className?: string;
  labels?: {
    unavailableTitle?: string;
    loadingTitle?: string;
    loadingDescription?: string;
    progressLabel?: string;
    loadErrorFallback?: string;
    renderErrorFallback?: string;
    canvasUnavailable?: string;
    pageAriaLabel?: (pageNumber: number, documentTitle: string) => string;
  };
}

export function PdfPreview({ url, title, className, labels }: PdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const task = getDocument(url);

    setDoc(null);
    setNumPages(0);
    setError(null);

    task.promise
      .then((loadedDoc: PDFDocumentProxy) => {
        if (cancelled) {
          void loadedDoc.destroy();
          return;
        }
        setDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
      })
      .catch((reason: unknown) => {
        if (cancelled) return;
        const message = reason instanceof Error
          ? reason.message
          : (labels?.loadErrorFallback ?? 'Failed to load PDF preview');
        setError(message);
      });

    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [labels?.loadErrorFallback, url]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateWidth = () => {
      setContainerWidth(Math.max(element.clientWidth - 32, 320));
    };

    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const pageNumbers = useMemo(
    () => Array.from({ length: numPages }, (_, index) => index + 1),
    [numPages],
  );

  return (
    <div ref={containerRef} className={cn('h-full overflow-auto bg-[#eef2f6] p-4', className)}>
      {error ? (
        <div className="flex h-full items-center justify-center">
          <AsyncStatusCard
            title={labels?.unavailableTitle ?? 'PDF preview is unavailable'}
            description={error}
            icon={<AlertCircle className="h-7 w-7" />}
            progressLabel={labels?.progressLabel}
          />
        </div>
      ) : !doc || numPages === 0 || containerWidth === 0 ? (
        <div className="flex h-full items-center justify-center">
          <AsyncStatusCard
            title={labels?.loadingTitle ?? 'Loading PDF preview'}
            description={labels?.loadingDescription ?? 'Rendering document pages for a cleaner side-by-side reading view.'}
            progressLabel={labels?.progressLabel}
          />
        </div>
      ) : (
        <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
          {pageNumbers.map((pageNumber) => (
            <PdfPageCanvas
              key={`${url}-${pageNumber}-${containerWidth}`}
              doc={doc}
              pageNumber={pageNumber}
              width={containerWidth}
              title={labels?.pageAriaLabel?.(pageNumber, title) ?? `${title} page ${pageNumber}`}
              labels={labels}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PdfPageCanvas({
  doc,
  pageNumber,
  width,
  title,
  labels,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  title: string;
  labels?: PdfPreviewProps['labels'];
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;

    async function renderPage() {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = width / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const context = canvas?.getContext('2d');

        if (!canvas || !context) {
          throw new Error(labels?.canvasUnavailable ?? 'Canvas context is unavailable');
        }

        const devicePixelRatio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * devicePixelRatio);
        canvas.height = Math.floor(viewport.height * devicePixelRatio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
        context.clearRect(0, 0, viewport.width, viewport.height);

        const activeRenderTask = page.render({ canvasContext: context, viewport });
        renderTask = activeRenderTask;
        await activeRenderTask.promise;

        if (cancelled) return;
        setError(null);
      } catch (reason: unknown) {
        if (cancelled) return;
        const message = reason instanceof Error
          ? reason.message
          : (labels?.renderErrorFallback ?? 'Failed to render PDF page');
        setError(message);
      }
    }

    void renderPage();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [doc, labels, pageNumber, width]);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {error ? (
        <div className="flex min-h-48 items-center justify-center px-6 py-10 text-center text-sm text-rose-500">
          {error}
        </div>
      ) : (
        <canvas ref={canvasRef} aria-label={title} className="block w-full" />
      )}
    </div>
  );
}
