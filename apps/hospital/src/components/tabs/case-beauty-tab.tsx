'use client';

import { Image as ImageIcon } from 'lucide-react';
import type { HospitalCaseDetail, MessageItem } from '@/lib/api-types';

const BEAUTY_UPLOAD_MARKER = '[Beauty Consultation Upload]';

function parseBeautyUpload(content: string): Record<string, string> | null {
  if (!content.includes(BEAUTY_UPLOAD_MARKER)) return null;

  const fields: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    const key = match?.[1]?.trim();
    if (key) {
      fields[key] = (match?.[2] ?? '').trim();
    }
  }
  return fields;
}

function findBeautyUpload(caseDetail: HospitalCaseDetail): MessageItem | null {
  const messages = (caseDetail.messageSections ?? []).flatMap((section) => section.messages ?? []);
  return [...messages]
    .filter((message) => parseBeautyUpload(message.content))
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    })[0] ?? null;
}

export function CaseBeautyTab({ caseDetail }: { caseDetail: HospitalCaseDetail }) {
  const uploadMessage = findBeautyUpload(caseDetail);
  const fields = uploadMessage ? parseBeautyUpload(uploadMessage.content) : null;
  const attachments = uploadMessage?.attachments ?? [];
  const viewLabels = fields?.['Five views']?.split(',').map((item) => item.trim()).filter(Boolean) ?? [];

  if (!uploadMessage || !fields) {
    return (
      <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <ImageIcon size={22} />
        </div>
        <h3 className="mt-4 text-base font-semibold text-slate-900">No beauty consultation upload yet</h3>
        <p className="mt-2 text-sm text-slate-500">
          The patient has not submitted the Medora Beauty five-view photo set for this case.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[1.5rem] border border-cyan-100 bg-cyan-50/70 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">Medora Beauty</p>
        <h3 className="mt-2 text-xl font-semibold text-slate-950">Beauty consultation details</h3>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          {['Patient name', 'Contact', 'Channel', 'Area', 'Age range', 'Country / region', 'Preferred hospital / doctor', 'Goals / history'].map((label) => (
            <div key={label} className={label === 'Goals / history' ? 'sm:col-span-2' : ''}>
              <dt className="text-slate-500">{label}</dt>
              <dd className="mt-1 font-medium text-slate-900">{fields[label] || 'Not provided'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-[1.5rem] border border-slate-200 bg-white p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Five-view photos</h3>
            <p className="text-sm text-slate-500">Uploaded from medorabeauty.com/consultation-upload</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {attachments.length} files
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {attachments.map((attachment, index) => {
            const href = attachment.url ?? attachment.storageKey ?? '';
            return (
              <a
                key={`${attachment.storageKey ?? attachment.fileName ?? index}`}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
              >
                {href ? (
                  <img
                    src={href}
                    alt={viewLabels[index] ?? attachment.fileName ?? `Beauty view ${index + 1}`}
                    className="aspect-square w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center text-slate-300">
                    <ImageIcon size={28} />
                  </div>
                )}
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-semibold text-slate-800">{viewLabels[index] ?? `View ${index + 1}`}</p>
                  <p className="truncate text-xs text-slate-500">{attachment.fileName ?? 'Photo attachment'}</p>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
