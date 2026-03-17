'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Stethoscope,
  Users,
  Camera,
  Plus,
  Edit2,
  Trash2,
  Check,
  Search,
  Shield,
  Languages,
  Plane,
  Sparkles,
  CreditCard,
  ImageIcon,
  Video,
  Upload,
  MoreVertical,
  Globe,
  Copy,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Clock,
  X,
  BedDouble,
  UserCheck,
  Map as MapIcon,
  Heart,
  ChevronDown,
  ChevronRight,
  Play,
} from 'lucide-react';
import {
  Button,
  Modal,
  EmptyState,
  LoadingSpinner,
} from '@medical-crm/ui';
import {
  useMaterialsInfo,
  useProcedures,
  useSurgeons,
  useBeforeAfterCases,
} from '@/queries/use-materials';
import {
  updateHospitalInfo,
  createProcedure,
  updateProcedure,
  deleteProcedure,
  createSurgeon,
  updateSurgeon,
  deleteSurgeon,
  createBeforeAfterCase,
  updateBeforeAfterCase,
  deleteBeforeAfterCase,
} from '@/actions/materials-actions';
import type {
  MaterialsHospitalInfoDTO,
  MaterialsProcedureDTO,
  MaterialsSurgeonDTO,
  MaterialsBeforeAfterCaseDTO,
} from '@/lib/api-types';
import { useAuth } from '@/lib/auth-context';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

// ── Reusable Image Upload Widget ───────────────────────────────────
function ImageUploadWidget({
  value,
  onChange,
  onFileSelect,
  label = 'Image',
  placeholder = 'https://... or click Upload',
  previewClassName = 'h-40 w-full',
  compact = false,
}: {
  value: string;
  onChange: (url: string) => void;
  onFileSelect?: (file: File) => void;
  label?: string;
  placeholder?: string;
  previewClassName?: string;
  compact?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (onFileSelect) {
      const previewUrl = URL.createObjectURL(file);
      onChange(previewUrl);
      onFileSelect(file);
    } else {
      onChange(await readFileAsDataUrl(file));
    }
    e.target.value = '';
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500';

  if (compact) {
    // Compact mode: square thumbnail + upload button, used in modals
    return (
      <div>
        <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
        <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
        <div className="flex items-start gap-3">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-24 h-24 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors cursor-pointer overflow-hidden shrink-0"
          >
            {value ? (
              <img src={value} alt={label} className="w-full h-full object-cover" />
            ) : (
              <>
                <Upload size={20} className="mb-1" />
                <span className="text-[10px] font-medium">Upload</span>
              </>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className={inputClass}
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
            >
              <Upload size={12} /> Choose File
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard mode: text input + upload button + preview below
  return (
    <div>
      <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleFileChange} />
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`flex-1 ${inputClass}`}
            placeholder={placeholder}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-2 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors shrink-0"
          >
            <Upload size={14} /> Upload
          </button>
        </div>
        {value && (
          <img src={value} alt={label} className={`${previewClassName} rounded-lg object-cover`} />
        )}
      </div>
    </div>
  );
}

// ── Reusable Video Upload Widget ───────────────────────────────────
function VideoUploadWidget({
  videos,
  onAdd,
  onRemove,
  label = 'Videos',
  emptyText = 'No videos uploaded',
  editing = false,
}: {
  videos: string[];
  onAdd?: (file: File) => void;
  onRemove?: (index: number) => void;
  label?: string;
  emptyText?: string;
  editing?: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => onAdd?.(file));
    e.target.value = '';
  };

  return (
    <div>
      <input
        type="file"
        ref={fileInputRef}
        accept="video/*"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-slate-700">{label}</h4>
        {editing && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
          >
            <Video size={12} /> Add Videos
          </button>
        )}
      </div>
      {videos.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {videos.map((videoUrl, idx) => (
            <div key={idx} className="relative group rounded-lg overflow-hidden border border-slate-200 aspect-video bg-slate-900">
              {playingIdx === idx ? (
                <video
                  src={videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  autoPlay
                  onEnded={() => setPlayingIdx(null)}
                />
              ) : (
                <>
                  <video src={videoUrl} className="w-full h-full object-cover" preload="metadata" />
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                    onClick={() => setPlayingIdx(idx)}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play size={18} className="text-slate-800 ml-0.5" />
                    </div>
                  </div>
                </>
              )}
              {editing && (
                <button
                  type="button"
                  onClick={() => onRemove?.(idx)}
                  className="absolute top-2 right-2 p-1 bg-white text-rose-600 rounded-md hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <Video size={24} className="mx-auto mb-1" />
            <span className="text-xs">{emptyText}</span>
            {editing && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="block mx-auto mt-2 text-xs font-medium text-blue-600"
              >
                <Upload size={12} className="inline mr-1" /> Upload Video
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'info', label: 'Hospital Info', icon: Building2 },
  { id: 'procedures', label: 'Procedures', icon: Stethoscope },
  { id: 'surgeons', label: 'Surgeons', icon: Users },
  { id: 'cases', label: 'Cases Before & After', icon: Camera },
];

function ConsumerWebsiteLink({ slug, hospitalType }: { slug: string; hospitalType: 'hospital' | 'regular_hospital' }) {
  const [copied, setCopied] = useState(false);
  const isRegular = hospitalType === 'regular_hospital';
  const url = slug
    ? isRegular
      ? `https://www.medicaltourismchina.health/hospitals/${slug}`
      : `https://www.medorabeauty.com/hospital/${slug}`
    : '';
  const description = isRegular
    ? 'The following information will be published as hospital information on www.medicaltourismchina.health'
    : 'The following information will be published as hospital information on www.medorabeauty.com';

  const handleCopy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-5 shadow-sm border border-green-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-green-500 rounded-lg p-2">
            <Globe size={20} className="text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800">Consumer Website Link</h3>
            <p className="text-sm text-slate-600 mt-0.5">{description}</p>
          </div>
        </div>
        {url && (
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={url}
              className="min-w-[320px] px-3 py-2 bg-white border border-green-200 rounded-lg text-sm font-mono text-slate-700 focus:outline-none cursor-text"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="px-3 py-2 border border-green-300 hover:bg-green-100 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
            >
              <Copy size={14} />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 border border-green-300 hover:bg-green-100 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-1.5 transition-colors shrink-0"
            >
              <ExternalLink size={14} />
              Jump
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function MaterialsTabs() {
  const [activeTab, setActiveTab] = useState('info');
  const { data: infoData } = useMaterialsInfo();
  const { user } = useAuth();
  const hospitalSlug = (infoData as MaterialsHospitalInfoDTO | undefined)?.slug ?? '';
  const hospitalType: 'hospital' | 'regular_hospital' = user.roles.includes('regular_hospital') ? 'regular_hospital' : 'hospital';
  const isRegular = hospitalType === 'regular_hospital';

  const visibleTabs = isRegular ? TABS.filter((t) => t.id !== 'procedures') : TABS;

  return (
    <div className="space-y-6">
      {/* Consumer Website Link */}
      <ConsumerWebsiteLink slug={hospitalSlug} hospitalType={hospitalType} />

      {/* Review Instructions Banner */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 shadow-sm border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="bg-blue-500 rounded-lg p-2 shrink-0">
            <Building2 size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-slate-800 mb-1">Review Instructions</h4>
            <p className="text-sm text-slate-600 mb-2">
              Your submitted materials will be pre-reviewed by AI and verified by our team before publication. Please ensure information is accurate and professional.
            </p>
            <div className="flex gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Clock size={14} className="text-amber-500" />
                AI review + human verification, within 0.5 business days
              </span>
              <span className="flex items-center gap-1">
                <Languages size={14} className="text-blue-500" />
                Content will be AI-translated into multiple languages
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Underline-style Tabs with icons */}
      <div className="flex items-center gap-6 border-b border-slate-200">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-4 text-sm font-medium transition-colors relative flex items-center gap-2 ${
                isActive ? 'text-cyan-600' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-600 rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'info' && <HospitalInfoTab hospitalType={hospitalType} />}
      {activeTab === 'procedures' && !isRegular && <ProceduresTab />}
      {activeTab === 'surgeons' && <SurgeonsTab />}
      {activeTab === 'cases' && <BeforeAfterTab />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 1 — Hospital Info                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
        <Icon size={16} />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    </div>
  );
}

// ── Options constants from CRM v1 ──────────────────────────────────
const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'kr', label: 'Korean' },
  { value: 'jp', label: 'Japanese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'th', label: 'Thai' },
  { value: 'es', label: 'Spanish' },
  { value: 'ru', label: 'Russian' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
];

const AIRPORT_SERVICE_OPTIONS = [
  { value: 'complimentary_transfer', label: 'Complimentary Airport Transfer' },
  { value: 'paid_transfer', label: 'Paid Airport Pickup' },
  { value: 'airport_assistance', label: 'Airport Assistance' },
  { value: 'visa_on_arrival', label: 'Visa on Arrival Assistance' },
];

const AMENITY_OPTIONS = [
  { value: 'private_suite', label: 'Private Recovery Suites' },
  { value: 'wifi', label: 'Free Wi-Fi' },
  { value: 'concierge', label: 'Medical Tourism Concierge' },
  { value: 'insurance_coord', label: 'International Insurance Coordination' },
  { value: 'visa_assistance', label: 'Visa Assistance' },
  { value: 'interpreter', label: 'Interpreter Services' },
  { value: 'halal_food', label: 'Halal Food Available' },
  { value: 'vegetarian', label: 'Vegetarian Options' },
  { value: 'family_accommodation', label: 'Family Accommodation' },
  { value: 'pharmacy', label: '24/7 Pharmacy' },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'debit_card', label: 'Debit Card' },
  { value: 'wechat_pay', label: 'WeChat Pay' },
  { value: 'alipay', label: 'Alipay' },
  { value: 'unionpay', label: 'UnionPay' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'international_transfer', label: 'International Transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'apple_pay', label: 'Apple Pay' },
  { value: 'google_pay', label: 'Google Pay' },
  { value: 'insurance_direct', label: 'Insurance Direct Billing' },
];

const CERTIFICATION_PRESETS = [
  { value: 'jci', label: 'JCI Accreditation' },
  { value: 'iso_9001', label: 'ISO 9001:2015' },
  { value: 'iso_15189', label: 'ISO 15189' },
  { value: 'nabh', label: 'NABH Accreditation' },
  { value: 'aahrpp', label: 'AAHRPP' },
  { value: 'cap', label: 'CAP Accreditation' },
];

const FOLLOWUP_OPTIONS = [
  { value: 'lifetime', label: 'Lifetime Follow-up Care' },
  { value: '1_year', label: '1 Year Follow-up' },
  { value: '6_months', label: '6 Months Follow-up' },
  { value: 'telemedicine', label: 'Remote Telemedicine' },
  { value: 'local_partner', label: 'Local Partner Clinic Referral' },
];

/** Shows selected items as chips + an "Add" button that opens a selection modal */
function ChipSelector({
  options,
  selected,
  onChange,
  editing,
  label,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  editing: boolean;
  label?: string;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const selectedLabels = options.filter((o) => selected.includes(o.value));

  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center">
        {selectedLabels.length > 0 ? (
          selectedLabels.map((opt) => (
            <span
              key={opt.value}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-medium"
            >
              <Check size={10} />
              {opt.label}
              {editing && (
                <button
                  onClick={() => onChange(selected.filter((v) => v !== opt.value))}
                  className="ml-0.5 text-indigo-400 hover:text-indigo-700"
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))
        ) : (
          <span className="text-sm text-slate-400">None selected</span>
        )}
        {editing && (
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-md text-xs font-medium hover:bg-blue-50 transition-colors"
          >
            <Plus size={12} /> Add
          </button>
        )}
      </div>
      {showAddModal && (
        <AddOptionsModal
          title={label ?? 'Select Options'}
          options={options}
          selected={selected}
          onChange={onChange}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

function AddOptionsModal({
  title,
  options,
  selected,
  onChange,
  onClose,
}: {
  title: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  onClose: () => void;
}) {
  const [localSelected, setLocalSelected] = useState<string[]>([...selected]);

  const toggle = (value: string) => {
    setLocalSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const handleDone = () => {
    onChange(localSelected);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={title}>
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {options.map((opt) => {
          const isChecked = localSelected.includes(opt.value);
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:bg-slate-50'
              }`}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(opt.value)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className={`text-sm font-medium ${isChecked ? 'text-indigo-700' : 'text-slate-700'}`}>
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
      <div className="pt-4 flex justify-end gap-3 border-t border-slate-100 mt-4">
        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
          Cancel
        </button>
        <button onClick={handleDone} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors">
          Done ({localSelected.length} selected)
        </button>
      </div>
    </Modal>
  );
}

// ── Operating Hours picker ─────────────────────────────────────────
const TIME_OPTIONS = [
  '00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30',
  '04:00', '04:30', '05:00', '05:30', '06:00', '06:30', '07:00', '07:30',
  '08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
  '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
  '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30',
];

const DAY_NAMES = [
  { key: 'monday', label: 'Mon', labelFull: 'Monday' },
  { key: 'tuesday', label: 'Tue', labelFull: 'Tuesday' },
  { key: 'wednesday', label: 'Wed', labelFull: 'Wednesday' },
  { key: 'thursday', label: 'Thu', labelFull: 'Thursday' },
  { key: 'friday', label: 'Fri', labelFull: 'Friday' },
  { key: 'saturday', label: 'Sat', labelFull: 'Saturday' },
  { key: 'sunday', label: 'Sun', labelFull: 'Sunday' },
];

function parseHoursString(hours: string | undefined): Record<string, { open: string; close: string; closed: boolean }> {
  const result: Record<string, { open: string; close: string; closed: boolean }> = {};
  DAY_NAMES.forEach((day) => {
    result[day.key] = { open: '09:00', close: '18:00', closed: false };
  });
  if (!hours) return result;
  const parts = hours.split(',').map((s) => s.trim());
  for (const part of parts) {
    const match = part.match(/^([\w-]+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/i);
    if (match) {
      const [, dayRange, open, close] = match;
      const days = parseDayRange(dayRange!);
      days.forEach((day) => {
        if (result[day]) {
          result[day] = { open: padTime(open!), close: padTime(close!), closed: false };
        }
      });
    }
  }
  return result;
}

function parseDayRange(range: string): string[] {
  const dayMap: Record<string, string> = {
    mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday',
    fri: 'friday', sat: 'saturday', sun: 'sunday',
    monday: 'monday', tuesday: 'tuesday', wednesday: 'wednesday',
    thursday: 'thursday', friday: 'friday', saturday: 'saturday', sunday: 'sunday',
  };
  const rangeParts = range.toLowerCase().split('-');
  if (rangeParts.length === 2) {
    const startDay = dayMap[rangeParts[0]!.trim()];
    const endDay = dayMap[rangeParts[1]!.trim()];
    if (startDay && endDay) {
      const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      const startIdx = dayOrder.indexOf(startDay);
      const endIdx = dayOrder.indexOf(endDay);
      if (startIdx !== -1 && endIdx !== -1) {
        return dayOrder.slice(startIdx, endIdx + 1);
      }
    }
  }
  const singleDay = dayMap[range.toLowerCase().trim()];
  return singleDay ? [singleDay] : [];
}

function padTime(time: string): string {
  const [h, m] = time.split(':');
  return `${(h ?? '').padStart(2, '0')}:${m}`;
}

function formatHoursToString(hours: Record<string, { open: string; close: string; closed: boolean }>): string {
  const groups: { days: string[]; open: string; close: string }[] = [];
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of dayOrder) {
    const h = hours[day]!;
    if (h.closed) continue;
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.open === h.open && lastGroup.close === h.close) {
      lastGroup.days.push(day);
    } else {
      groups.push({ days: [day], open: h.open, close: h.close });
    }
  }
  const dayShort: Record<string, string> = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
    friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
  };
  return groups
    .map((g) => {
      const dayStr =
        g.days.length > 1
          ? `${dayShort[g.days[0]!]}-${dayShort[g.days[g.days.length - 1]!]}`
          : dayShort[g.days[0]!];
      return `${dayStr} ${g.open}-${g.close}`;
    })
    .join(', ');
}

function OperatingHoursModal({
  hours,
  onChange,
  isOpen,
  onClose,
}: {
  hours?: string;
  onChange: (hours: string) => void;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [structuredHours, setStructuredHours] = useState(() => parseHoursString(hours));
  const [quickOpen, setQuickOpen] = useState('09:00');
  const [quickClose, setQuickClose] = useState('18:00');

  const updateDay = (dayKey: string, field: 'open' | 'close' | 'closed', value: string | boolean) => {
    setStructuredHours((prev) => ({
      ...prev,
      [dayKey]: { ...prev[dayKey]!, [field]: value },
    }));
  };

  const applyToWeekdays = () => {
    setStructuredHours((prev) => {
      const next = { ...prev };
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((day) => {
        next[day] = { open: quickOpen, close: quickClose, closed: false };
      });
      return next;
    });
  };

  const handleSave = () => {
    onChange(formatHoursToString(structuredHours));
    onClose();
  };

  const timeSelectOptions = TIME_OPTIONS.filter((_, i) => i % 2 === 0); // whole hours only in dropdown

  return (
    <Modal open={isOpen} onClose={onClose} title="Operating Hours" maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Quick Set Weekdays */}
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
          <span className="text-sm text-slate-600 shrink-0">Weekdays:</span>
          <select
            value={quickOpen}
            onChange={(e) => setQuickOpen(e.target.value)}
            className="w-20 h-8 text-xs border border-slate-200 rounded-md px-1 bg-white"
          >
            {timeSelectOptions.map((time) => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
          <span className="text-slate-400">-</span>
          <select
            value={quickClose}
            onChange={(e) => setQuickClose(e.target.value)}
            className="w-20 h-8 text-xs border border-slate-200 rounded-md px-1 bg-white"
          >
            {timeSelectOptions.map((time) => (
              <option key={time} value={time}>{time}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={applyToWeekdays}
            className="ml-auto h-8 px-3 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-100 transition-colors"
          >
            Apply
          </button>
        </div>

        {/* Day-by-day */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {DAY_NAMES.map((day) => {
            const dayData = structuredHours[day.key]!;
            return (
              <div key={day.key} className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg">
                <div className="w-10 text-sm font-medium text-slate-700">{day.label}</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!dayData.closed}
                    onChange={(e) => updateDay(day.key, 'closed', !e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-slate-200 rounded-full peer peer-checked:bg-green-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-full" />
                </label>
                {!dayData.closed ? (
                  <>
                    <select
                      value={dayData.open}
                      onChange={(e) => updateDay(day.key, 'open', e.target.value)}
                      className="w-20 h-7 text-xs border border-slate-200 rounded-md px-1 bg-white"
                    >
                      {timeSelectOptions.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                    <span className="text-slate-400 text-xs">-</span>
                    <select
                      value={dayData.close}
                      onChange={(e) => updateDay(day.key, 'close', e.target.value)}
                      className="w-20 h-7 text-xs border border-slate-200 rounded-md px-1 bg-white"
                    >
                      {timeSelectOptions.map((time) => (
                        <option key={time} value={time}>{time}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Closed</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Preview & Save */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-xs text-slate-500">{formatHoursToString(structuredHours) || 'No hours set'}</span>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Empty Map initializers (typed outside JSX to avoid TSX generic parsing issues)
type PendingVideoMap = Map<string, File>;
type PendingTestimonialMap = Map<string, { file: File; patientName: string; patientCountry: string; procedureName: string }>;
type PendingDeptImageMap = Map<string, { previewUrl: string; file: File }>;
const emptyVideoMap: PendingVideoMap = new Map();
const emptyTestimonialMap: PendingTestimonialMap = new Map();
const emptyDeptImageMap: PendingDeptImageMap = new Map();

function HospitalInfoTab({ hospitalType }: { hospitalType: 'hospital' | 'regular_hospital' }) {
  const { data, isLoading } = useMaterialsInfo();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [languages, setLanguages] = useState<string[]>(['en', 'zh']);
  const [airportServices, setAirportServices] = useState<string[]>([]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<Array<{ id: string; name: string; year?: number }>>([]);
  const [newCertType, setNewCertType] = useState('');
  const [newCertYear, setNewCertYear] = useState('');
  const [followupCare, setFollowupCare] = useState<string[]>([]);
  const [attractions, setAttractions] = useState<Array<{ id: string; name: string; distance: string }>>([]);
  const [newAttractionName, setNewAttractionName] = useState('');
  const [newAttractionDistance, setNewAttractionDistance] = useState('');
  const [pendingPhotos, setPendingPhotos] = useState<Array<{ previewUrl: string; file: File }>>([]);
  const [showHoursModal, setShowHoursModal] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const isRegular = hospitalType === 'regular_hospital';

  // Department state (regular_hospital only)
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [showDeptSelector, setShowDeptSelector] = useState(false);
  const [deptDescriptions, setDeptDescriptions] = useState<Record<string, string>>({});
  const [deptKeyServices, setDeptKeyServices] = useState<Record<string, string[]>>({});
  const [deptStats, setDeptStats] = useState<Record<string, { specialists?: number; annualPatients?: number }>>({});
  const [deptServiceInputs, setDeptServiceInputs] = useState<Record<string, string>>({});
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());

  // Equipment state (regular_hospital only)
  const [equipment, setEquipment] = useState<Array<{ name: string; description: string; imageUrl: string }>>([]);

  // Promotional videos state
  const [promotionalVideos, setPromotionalVideos] = useState<string[]>([]);
  const [pendingVideos, setPendingVideos] = useState(emptyVideoMap);

  // Video testimonials state
  const [videoTestimonials, setVideoTestimonials] = useState<Array<{
    id: string;
    videoUrl: string;
    thumbnailUrl?: string;
    patientName?: string;
    patientCountry?: string;
    procedureName?: string;
    duration?: string;
  }>>([]);
  const [pendingTestimonials, setPendingTestimonials] = useState(emptyTestimonialMap);
  const [isAddingTestimonial, setIsAddingTestimonial] = useState(false);
  const [pendingTestimonial, setPendingTestimonial] = useState<{
    previewUrl: string;
    file: File;
    patientName: string;
    patientCountry: string;
    procedureName: string;
  } | null>(null);
  const testimonialInputRef = useRef<HTMLInputElement>(null);

  // Department images state (regular_hospital only)
  const [deptImages, setDeptImages] = useState<Record<string, string>>({});
  const [pendingDeptImages, setPendingDeptImages] = useState(emptyDeptImageMap);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (data as any) ?? null;
  const info = {
    name: raw?.name ?? '',
    nameEn: raw?.nameEn ?? '',
    slug: raw?.slug ?? '',
    heroImage: raw?.heroImage ?? '',
    photos: raw?.photos ?? [],
    highlights: raw?.highlights ?? [],
    yearEstablished: raw?.yearEstablished ?? '',
    tagline: raw?.tagline ?? '',
    description: raw?.description ?? '',
    phone: raw?.phone ?? '',
    email: raw?.email ?? '',
    address: raw?.address ?? '',
    website: raw?.website ?? '',
    operatingHours: raw?.operatingHours ?? raw?.hours ?? '',
    bedCount: raw?.bedCount ?? '',
    patientCapacity: raw?.patientCapacity ?? '',
    totalPatients: raw?.totalPatients ?? '',
    nearbyAttractions: raw?.nearbyAttractions ?? [],
    departments: raw?.departments ?? [],
    departmentDescriptions: raw?.departmentDescriptions ?? {},
    departmentKeyServices: raw?.departmentKeyServices ?? {},
    departmentStats: raw?.departmentStats ?? {},
    departmentImages: raw?.departmentImages ?? {},
    equipment: raw?.equipment ?? [],
    promotionalVideos: raw?.promotionalVideos ?? [],
    videoTestimonials: raw?.videoTestimonials ?? [],
    province: raw?.province ?? '',
    city: raw?.city ?? '',
    district: raw?.district ?? '',
    tier: raw?.tier ?? '',
    ownershipType: raw?.ownershipType ?? '',
    hospitalType: raw?.hospitalType ?? '',
    // Array fields from API for chip selectors
    multilingualStaff: raw?.multilingualStaff ?? [],
    airportServices: raw?.airportServices ?? [],
    amenities: raw?.amenities ?? [],
    paymentMethods: raw?.paymentMethods ?? [],
    certifications: raw?.certifications ?? [],
    followUpCare: raw?.followUpCare ?? [],
  };

  // Sync array/chip state from loaded data when data first loads
  // This ensures read-only display and edit mode show correct data from the API
  useEffect(() => {
    if (!raw) return;
    setForm({
      name: raw.name ?? '',
      nameEn: raw.nameEn ?? '',
      heroImage: raw.heroImage ?? '',
      yearEstablished: raw.yearEstablished != null ? String(raw.yearEstablished) : '',
      tagline: raw.tagline ?? '',
      description: raw.description ?? '',
      phone: raw.phone ?? '',
      email: raw.email ?? '',
      address: raw.address ?? '',
      website: raw.website ?? '',
      operatingHours: raw.operatingHours ?? raw.hours ?? '',
      bedCount: raw.bedCount != null ? String(raw.bedCount) : '',
      patientCapacity: raw.patientCapacity != null ? String(raw.patientCapacity) : '',
      totalPatients: raw.totalPatients != null ? String(raw.totalPatients) : '',
      province: raw.province ?? '',
      city: raw.city ?? '',
      district: raw.district ?? '',
      tier: raw.tier ?? '',
      ownershipType: raw.ownershipType ?? '',
      hospitalType: raw.hospitalType ?? '',
    });
    setLanguages(raw.multilingualStaff ?? []);
    setAirportServices(raw.airportServices ?? []);
    setAmenities(raw.amenities ?? []);
    setPaymentMethods(raw.paymentMethods ?? []);
    setCertifications((raw.certifications ?? []).map((c: { id?: string; name: string; year?: number }, i: number) => ({
      id: c.id ?? `cert-${i}`,
      name: c.name ?? '',
      year: c.year,
    })));
    setFollowupCare(raw.followUpCare ?? []);
    setAttractions((raw.nearbyAttractions ?? []).map((a: { id?: string; name: string; distance: string }, i: number) => ({
      id: a.id ?? `attr-${i}`,
      name: a.name ?? '',
      distance: a.distance ?? '',
    })));
    setSelectedDepartments(raw.departments ?? []);
    setDeptDescriptions(raw.departmentDescriptions ?? {});
    setDeptKeyServices(raw.departmentKeyServices ?? {});
    setDeptStats(raw.departmentStats ?? {});
    setDeptImages(raw.departmentImages ?? {});
    setEquipment((raw.equipment ?? []).map((e: { name: string; description?: string; image_url?: string }) => ({
      name: e.name ?? '',
      description: e.description ?? '',
      imageUrl: e.image_url ?? '',
    })));
    setPromotionalVideos(raw.promotionalVideos ?? []);
    setVideoTestimonials(raw.videoTestimonials ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const startEdit = () => {
    setForm({
      name: info.name,
      nameEn: info.nameEn,
      heroImage: info.heroImage,
      yearEstablished: String(info.yearEstablished),
      tagline: info.tagline,
      description: info.description,
      phone: info.phone,
      email: info.email,
      address: info.address,
      website: info.website,
      operatingHours: info.operatingHours,
      bedCount: String(info.bedCount),
      patientCapacity: String(info.patientCapacity),
      totalPatients: String(info.totalPatients),
      province: info.province,
      city: info.city,
      district: info.district,
      tier: info.tier,
      ownershipType: info.ownershipType,
      hospitalType: info.hospitalType,
    });
    setAttractions(info.nearbyAttractions.map((a: { name: string; distance: string }, i: number) => ({ id: `attr-${i}`, name: a.name ?? '', distance: a.distance ?? '' })));
    if (info.departments.length) setSelectedDepartments(info.departments);
    setDeptDescriptions(info.departmentDescriptions ?? {});
    setDeptKeyServices(info.departmentKeyServices ?? {});
    setDeptStats(info.departmentStats ?? {});
    setDeptServiceInputs({});
    setEquipment((info.equipment ?? []).map((e: { name: string; description?: string; image_url?: string }) => ({
      name: e.name ?? '',
      description: e.description ?? '',
      imageUrl: e.image_url ?? '',
    })));
    setPendingPhotos([]);
    // Sync chip/array state from loaded data into edit mode
    setLanguages(info.multilingualStaff ?? []);
    setAirportServices(info.airportServices ?? []);
    setAmenities(info.amenities ?? []);
    setPaymentMethods(info.paymentMethods ?? []);
    setCertifications((info.certifications ?? []).map((c: { id?: string; name: string; year?: number }, i: number) => ({
      id: c.id ?? `cert-${i}`,
      name: c.name ?? '',
      year: c.year,
    })));
    setFollowupCare(info.followUpCare ?? []);
    setPromotionalVideos([...(info.promotionalVideos ?? [])]);
    setPendingVideos(new Map());
    setVideoTestimonials([...(info.videoTestimonials ?? [])]);
    setPendingTestimonials(new Map());
    setPendingTestimonial(null);
    setIsAddingTestimonial(false);
    setDeptImages(info.departmentImages ?? {});
    setPendingDeptImages(new Map());
    setEditing(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateHospitalInfo({
        name: form.name || undefined,
        nameEn: form.nameEn || undefined,
        heroImage: form.heroImage || null,
        photos: [...(info.photos ?? []), ...pendingPhotos.map((photo) => photo.previewUrl)],
        yearEstablished: form.yearEstablished ? Number(form.yearEstablished) : undefined,
        tagline: form.tagline || undefined,
        description: form.description || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address || undefined,
        website: form.website || undefined,
        operatingHours: form.operatingHours || undefined,
        bedCount: form.bedCount ? Number(form.bedCount) : undefined,
        patientCapacity: form.patientCapacity ? Number(form.patientCapacity) : undefined,
        totalPatients: form.totalPatients ? Number(form.totalPatients) : undefined,
        province: form.province || undefined,
        city: form.city || undefined,
        district: form.district || undefined,
        tier: form.tier || undefined,
        ownershipType: form.ownershipType || undefined,
        hospitalType: form.hospitalType || undefined,
        nearbyAttractions: attractions.map((a) => ({ name: a.name, distance: a.distance })),
        // Chip/array fields
        multilingualStaff: languages,
        airportServices,
        amenities,
        paymentMethods,
        certifications: certifications.map((c) => ({ id: c.id, name: c.name, year: c.year, isActive: true })),
        followUpCare: followupCare,
        // Include videos — filter out blob URLs (pending files not yet uploaded)
        promotionalVideos: promotionalVideos.filter((v) => !v.startsWith('blob:')),
        videoTestimonials: videoTestimonials
          .filter((t) => !t.videoUrl.startsWith('blob:'))
          .map((t) => ({
            id: t.id,
            videoUrl: t.videoUrl,
            thumbnailUrl: t.thumbnailUrl,
            patientName: t.patientName,
            patientCountry: t.patientCountry,
            procedureName: t.procedureName,
            duration: t.duration,
          })),
        ...(isRegular ? {
          departments: selectedDepartments,
          departmentDescriptions: deptDescriptions,
          departmentKeyServices: deptKeyServices,
          departmentStats: deptStats,
          departmentImages: deptImages,
          equipment: equipment.map((e) => ({ name: e.name, description: e.description, image_url: e.imageUrl })),
        } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['materials', 'info'] });
      setEditing(false);
    } catch {
      // Error handled upstream
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    void Promise.all(Array.from(files).map(async (file) => ({
      previewUrl: await readFileAsDataUrl(file),
      file,
    }))).then((newPhotos) => {
      setPendingPhotos((prev) => [...prev, ...newPhotos]);
    });
    e.target.value = '';
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500';

  const renderField = (label: string, key: string, opts?: { type?: string; placeholder?: string; icon?: React.ElementType; rows?: number }) => {
    const Icon = opts?.icon;
    return (
      <div>
        <label className="block text-xs font-medium text-slate-500 mb-1">
          {Icon && <Icon size={12} className="inline mr-1" />}{label}
        </label>
        {editing ? (
          opts?.rows ? (
            <textarea
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={`${inputClass} resize-none`}
              rows={opts.rows}
              placeholder={opts?.placeholder ?? ''}
            />
          ) : (
            <input
              type={opts?.type ?? 'text'}
              value={form[key] ?? ''}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className={inputClass}
              placeholder={opts?.placeholder ?? ''}
            />
          )
        ) : (
          <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
            {form[key] || <span className="text-slate-400">{opts?.placeholder ?? 'Not set'}</span>}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Edit Profile sticky bar */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm sticky top-0 z-10">
        <div className="text-sm text-slate-500">
          {editing ? 'Editing hospital information...' : 'Viewing hospital information'}
        </div>
        <div className="flex items-center gap-3">
          {editing ? (
            <>
              <button
                onClick={() => {
                  // Clean up blob URLs
                  pendingPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
                  for (const url of pendingVideos.keys()) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); }
                  for (const p of pendingDeptImages.values()) { if (p.previewUrl.startsWith('blob:')) URL.revokeObjectURL(p.previewUrl); }
                  if (pendingTestimonial?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(pendingTestimonial.previewUrl);
                  for (const key of pendingTestimonials.keys()) { if (key.startsWith('blob:')) URL.revokeObjectURL(key); }
                  setPendingPhotos([]);
                  setPendingVideos(new Map());
                  setPendingTestimonials(new Map());
                  setPendingTestimonial(null);
                  setIsAddingTestimonial(false);
                  setPendingDeptImages(new Map());
                  setEditing(false);
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Check size={16} /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors flex items-center gap-2"
            >
              <Edit2 size={16} /> Edit Profile
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={Building2} title="Basic Information" />
            <div className="space-y-4">
              <div>
                {renderField('Hospital Name', 'name', { placeholder: 'Hospital name' })}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {renderField('Year Established', 'yearEstablished', { type: 'number', placeholder: 'e.g. 2005' })}
                {renderField('Tagline', 'tagline', { placeholder: 'A short tagline' })}
              </div>
              {renderField('Description', 'description', { rows: 4, placeholder: 'Hospital description...' })}
              {editing ? (
                <ImageUploadWidget
                  value={form.heroImage ?? ''}
                  onChange={(url) => setForm({ ...form, heroImage: url })}
                  label="Hero Image"
                  placeholder="https://... or click Upload"
                  previewClassName="h-40 w-full"
                />
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Hero Image</label>
                  {info.heroImage ? (
                    <img src={info.heroImage} alt="Hero" className="h-40 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                      <div className="text-center">
                        <ImageIcon size={24} className="mx-auto mb-1" />
                        <span className="text-xs">No hero image</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contact & Location */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={MapPin} title="Contact & Location" />
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {renderField('Phone', 'phone', { icon: Phone, placeholder: '+1 234 567 890' })}
                {renderField('Email', 'email', { icon: Mail, placeholder: 'hospital@example.com' })}
              </div>
              {renderField('Address', 'address', { icon: MapPin, placeholder: 'Full address' })}
              {renderField('Website', 'website', { icon: Globe, placeholder: 'https://...' })}
              {/* Operating Hours with picker */}
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">
                  <Clock size={12} className="inline mr-1" />Operating Hours
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editing ? (form.operatingHours ?? '') : (info.operatingHours || '')}
                    onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
                    readOnly={!editing}
                    className={inputClass}
                    placeholder="e.g. Mon-Fri 09:00-18:00"
                  />
                  {editing && (
                    <button
                      type="button"
                      onClick={() => setShowHoursModal(true)}
                      className="shrink-0 px-3 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-sm font-medium text-slate-700 flex items-center gap-1.5 transition-colors"
                    >
                      <Clock size={14} />
                      Set Hours
                    </button>
                  )}
                </div>
              </div>
              <OperatingHoursModal
                hours={form.operatingHours || info.operatingHours}
                onChange={(newHours) => setForm({ ...form, operatingHours: newHours })}
                isOpen={showHoursModal}
                onClose={() => setShowHoursModal(false)}
              />
            </div>
          </div>

          {/* Hospital Photos & Videos */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={ImageIcon} title="Hospital Photos & Videos" />
            <input type="file" ref={photoInputRef} accept="image/*" multiple className="hidden" onChange={handlePhotoSelect} />
            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-slate-700">Photos</h4>
                  {editing && (
                    <button
                      onClick={() => photoInputRef.current?.click()}
                      className="text-xs font-medium text-blue-600 flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      <Upload size={12} /> Upload Photos
                    </button>
                  )}
                </div>
                {(info.photos.length > 0 || pendingPhotos.length > 0) ? (
                  <div className="grid grid-cols-4 gap-3">
                    {info.photos.map((url: string, i: number) => (
                      <div
                        key={`existing-${i}`}
                        className="aspect-square rounded-lg bg-slate-100 border border-slate-200 overflow-hidden relative group"
                      >
                        <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                        {editing && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button className="p-1.5 bg-white text-rose-600 rounded-md hover:bg-rose-50">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {pendingPhotos.map((p, i) => (
                      <div
                        key={`pending-${i}`}
                        className="aspect-square rounded-lg bg-slate-100 border-2 border-blue-300 overflow-hidden relative group"
                      >
                        <img src={p.previewUrl} alt={`New photo ${i + 1}`} className="w-full h-full object-cover" />
                        <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-blue-600 text-white text-[10px] font-medium rounded">New</span>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button
                            onClick={() => {
                              URL.revokeObjectURL(p.previewUrl);
                              setPendingPhotos((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                            className="p-1.5 bg-white text-rose-600 rounded-md hover:bg-rose-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className={`h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400 ${editing ? 'cursor-pointer hover:bg-slate-100 hover:border-blue-300' : ''}`}
                    onClick={editing ? () => photoInputRef.current?.click() : undefined}
                  >
                    <div className="text-center">
                      <ImageIcon size={24} className="mx-auto mb-1" />
                      <span className="text-xs">{editing ? 'Click to upload photos' : 'No photos uploaded'}</span>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <VideoUploadWidget
                  videos={editing ? promotionalVideos : (info.promotionalVideos ?? [])}
                  editing={editing}
                  label="Promotional Videos"
                  emptyText="No videos uploaded"
                  onAdd={(file) => {
                    void readFileAsDataUrl(file).then((previewUrl) => {
                      setPendingVideos((prev) => new Map(prev).set(previewUrl, file));
                      setPromotionalVideos((prev) => [...prev, previewUrl]);
                    });
                  }}
                  onRemove={(idx) => {
                    const url = promotionalVideos[idx];
                    if (url?.startsWith('blob:')) {
                      setPendingVideos((prev) => { const m = new Map(prev); m.delete(url); return m; });
                      URL.revokeObjectURL(url);
                    }
                    setPromotionalVideos((prev) => prev.filter((_, i) => i !== idx));
                  }}
                />
              </div>
            </div>
          </div>

          {/* Video Testimonials */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={Video} title="Video Testimonials" />
            <input
              type="file"
              ref={testimonialInputRef}
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                void readFileAsDataUrl(file).then((previewUrl) => {
                  setPendingTestimonial({
                    previewUrl,
                    file,
                    patientName: '',
                    patientCountry: '',
                    procedureName: '',
                  });
                  setIsAddingTestimonial(true);
                });
                e.target.value = '';
              }}
            />
            {editing && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => testimonialInputRef.current?.click()}
                  className="px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-200 rounded-lg text-xs font-medium flex items-center gap-1.5 hover:bg-purple-100 transition-colors"
                >
                  <Plus size={12} /> Add Testimonial
                </button>
              </div>
            )}
            {(() => {
              const testimonials = editing ? videoTestimonials : (info.videoTestimonials ?? []);
              return testimonials.length > 0 || (editing && isAddingTestimonial) ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {testimonials.map((testimonial: { id: string; videoUrl: string; thumbnailUrl?: string; patientName?: string; patientCountry?: string; procedureName?: string; duration?: string }, i: number) => (
                    <div key={testimonial.id} className="rounded-xl border border-slate-200 overflow-hidden relative group">
                      <div className="aspect-video bg-slate-900 flex items-center justify-center relative">
                        {testimonial.thumbnailUrl ? (
                          <img src={testimonial.thumbnailUrl} alt={testimonial.patientName ?? ''} className="w-full h-full object-cover" />
                        ) : testimonial.videoUrl ? (
                          <video src={testimonial.videoUrl} className="w-full h-full object-cover" muted preload="metadata" />
                        ) : (
                          <Video size={32} className="text-white/50" />
                        )}
                        {/* Play button overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                            <Play size={18} className="text-slate-800 ml-0.5" />
                          </div>
                        </div>
                        {testimonial.duration && (
                          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
                            {testimonial.duration}
                          </span>
                        )}
                        {editing && (
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 z-10">
                            <button
                              type="button"
                              onClick={() => {
                                const t = (editing ? videoTestimonials : [])[i];
                                if (t?.videoUrl.startsWith('blob:')) {
                                  setPendingTestimonials((prev) => { const m = new Map(prev); m.delete(t.videoUrl); return m; });
                                  URL.revokeObjectURL(t.videoUrl);
                                }
                                setVideoTestimonials((prev) => prev.filter((_, idx) => idx !== i));
                              }}
                              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium flex items-center gap-1 hover:bg-rose-700 transition-colors"
                            >
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="p-3 bg-white">
                        <p className="font-medium text-sm">{testimonial.patientName || 'Unknown Patient'}</p>
                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                          {testimonial.patientCountry && (
                            <span className="flex items-center gap-1">
                              <Globe size={10} />
                              {testimonial.patientCountry}
                            </span>
                          )}
                          {testimonial.procedureName && (
                            <span className="flex items-center gap-1">
                              <Stethoscope size={10} />
                              {testimonial.procedureName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Inline "add new" card while adding */}
                  {editing && isAddingTestimonial && pendingTestimonial && (
                    <div className="rounded-xl border-2 border-purple-400 bg-purple-50 p-4 space-y-3">
                      <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden relative">
                        <video src={pendingTestimonial.previewUrl} className="w-full h-full object-cover" controls />
                      </div>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Patient Name *</label>
                          <input
                            type="text"
                            placeholder="e.g. John D."
                            value={pendingTestimonial.patientName}
                            onChange={(e) => setPendingTestimonial({ ...pendingTestimonial, patientName: e.target.value })}
                            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Country</label>
                            <input
                              type="text"
                              placeholder="e.g. USA"
                              value={pendingTestimonial.patientCountry}
                              onChange={(e) => setPendingTestimonial({ ...pendingTestimonial, patientCountry: e.target.value })}
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1">Procedure</label>
                            <input
                              type="text"
                              placeholder="e.g. Rhinoplasty"
                              value={pendingTestimonial.procedureName}
                              onChange={(e) => setPendingTestimonial({ ...pendingTestimonial, procedureName: e.target.value })}
                              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            URL.revokeObjectURL(pendingTestimonial.previewUrl);
                            setPendingTestimonial(null);
                            setIsAddingTestimonial(false);
                          }}
                          className="flex-1 px-3 py-1.5 bg-white text-slate-600 border border-slate-300 rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-slate-50 transition-colors"
                        >
                          <X size={12} /> Cancel
                        </button>
                        <button
                          type="button"
                          disabled={!pendingTestimonial.patientName}
                          onClick={() => {
                            const tempId = `temp-${Date.now()}`;
                            const previewUrl = pendingTestimonial.previewUrl;
                            setPendingTestimonials((prev) => new Map(prev).set(previewUrl, {
                              file: pendingTestimonial.file,
                              patientName: pendingTestimonial.patientName,
                              patientCountry: pendingTestimonial.patientCountry,
                              procedureName: pendingTestimonial.procedureName,
                            }));
                            setVideoTestimonials((prev) => [
                              ...prev,
                              {
                                id: tempId,
                                videoUrl: previewUrl,
                                patientName: pendingTestimonial.patientName,
                                patientCountry: pendingTestimonial.patientCountry,
                                procedureName: pendingTestimonial.procedureName,
                              },
                            ]);
                            setPendingTestimonial(null);
                            setIsAddingTestimonial(false);
                          }}
                          className="flex-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <Check size={12} /> Confirm
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-32 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <Video size={24} className="mx-auto mb-1" />
                    <span className="text-xs">No video testimonials yet</span>
                    {editing && (
                      <button
                        type="button"
                        onClick={() => testimonialInputRef.current?.click()}
                        className="block mx-auto mt-2 text-xs font-medium text-purple-600"
                      >
                        <Plus size={12} className="inline mr-1" /> Add Testimonial
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Hospital Capacity */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={BedDouble} title="Hospital Capacity" />
            <div className="grid grid-cols-3 gap-4">
              {[
                { key: 'bedCount', label: 'Beds', placeholder: 'e.g. 200' },
                { key: 'patientCapacity', label: 'Patient Capacity', placeholder: 'e.g. 500' },
                { key: 'totalPatients', label: 'Total Patients Served', placeholder: 'e.g. 10000' },
              ].map((item) => (
                <div key={item.key} className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  {editing ? (
                    <input
                      type="number"
                      value={form[item.key] ?? ''}
                      onChange={(e) => setForm({ ...form, [item.key]: e.target.value })}
                      className="w-full text-center text-2xl font-bold text-indigo-600 bg-transparent border-none outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder={item.placeholder}
                    />
                  ) : (
                    <div className="text-2xl font-bold text-slate-900">
                      {form[item.key] && form[item.key] !== '0' && form[item.key] !== '' ? Number(form[item.key]).toLocaleString() : '\u2014'}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 mt-1">{item.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Nearby Attractions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={MapIcon} title="Nearby Attractions" />
            <div className="space-y-3">
              {attractions.length > 0 && attractions.map((attraction) => (
                <div key={attraction.id} className="flex items-center justify-between p-3 bg-teal-50 rounded-lg border border-teal-100">
                  <div className="flex items-center gap-3">
                    <MapPin size={16} className="text-teal-600" />
                    <span className="font-medium text-sm text-slate-800">{attraction.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-1 bg-white border border-teal-200 rounded text-teal-700">{attraction.distance}</span>
                    {editing && (
                      <button
                        onClick={() => setAttractions((prev) => prev.filter((a) => a.id !== attraction.id))}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {editing ? (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-3">
                    <input
                      type="text"
                      placeholder="Attraction name"
                      value={newAttractionName}
                      onChange={(e) => setNewAttractionName(e.target.value)}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      placeholder="Distance (e.g. 2km)"
                      value={newAttractionDistance}
                      onChange={(e) => setNewAttractionDistance(e.target.value)}
                      className={inputClass}
                    />
                    <button
                      disabled={!newAttractionName || !newAttractionDistance}
                      onClick={() => {
                        setAttractions((prev) => [
                          ...prev,
                          { id: `attr-${Date.now()}`, name: newAttractionName, distance: newAttractionDistance },
                        ]);
                        setNewAttractionName('');
                        setNewAttractionDistance('');
                      }}
                      className="px-4 py-2 bg-teal-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
              ) : attractions.length === 0 ? (
                <div className="h-24 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                  <div className="text-center">
                    <MapIcon size={20} className="mx-auto mb-1" />
                    <span className="text-xs">No nearby attractions added</span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Departments — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader icon={Building2} title="Departments" />
              {/* Department selector chips */}
              {editing && (
                <div className="mb-4">
                  <div className="flex flex-wrap gap-2">
                    {selectedDepartments.map((dept) => {
                      const opt = DEPARTMENT_OPTIONS.find((o) => o.value === dept);
                      return (
                        <span key={dept} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md text-xs font-medium">
                          {opt?.label ?? dept}
                          <button onClick={() => setSelectedDepartments((p) => p.filter((d) => d !== dept))} className="ml-0.5 text-indigo-400 hover:text-indigo-700"><X size={10} /></button>
                        </span>
                      );
                    })}
                    <button
                      onClick={() => setShowDeptSelector(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-md text-xs font-medium hover:bg-blue-50 transition-colors"
                    >
                      <Plus size={12} /> Add Departments
                    </button>
                  </div>
                  {showDeptSelector && (
                    <AddOptionsModal
                      title="Select Departments"
                      options={DEPARTMENT_OPTIONS}
                      selected={selectedDepartments}
                      onChange={setSelectedDepartments}
                      onClose={() => setShowDeptSelector(false)}
                    />
                  )}
                </div>
              )}

              {/* Non-editing: show chips */}
              {!editing && selectedDepartments.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedDepartments.map((dept) => {
                    const opt = DEPARTMENT_OPTIONS.find((o) => o.value === dept);
                    return (
                      <span key={dept} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-sm font-medium">
                        {opt?.label ?? dept}
                      </span>
                    );
                  })}
                </div>
              )}

              {!editing && selectedDepartments.length === 0 && (
                <p className="text-sm text-slate-400">No departments configured.</p>
              )}

              {/* Department detail cards */}
              {selectedDepartments.length > 0 && (
                <div className="space-y-3 mt-2 pt-4 border-t border-slate-200">
                  {selectedDepartments.map((deptValue) => {
                    const opt = DEPARTMENT_OPTIONS.find((o) => o.value === deptValue);
                    const deptLabel = opt?.label ?? deptValue;
                    const isExpanded = expandedDepts.has(deptValue);
                    const keyServices = deptKeyServices[deptValue] ?? [];
                    const stats = deptStats[deptValue] ?? {};
                    const desc = deptDescriptions[deptValue] ?? '';
                    const hasSpecialists = stats.specialists !== undefined && stats.specialists !== null;
                    const hasAnnualPatients = stats.annualPatients !== undefined && stats.annualPatients !== null;

                    return (
                      <div key={deptValue} className="border border-slate-200 rounded-lg overflow-hidden">
                        {/* Department header — clickable to expand/collapse */}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedDepts((prev) => {
                              const next = new Set(prev);
                              if (next.has(deptValue)) next.delete(deptValue);
                              else next.add(deptValue);
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                            <h4 className="font-medium text-sm text-slate-800">{deptLabel}</h4>
                          </div>
                          {!editing && (hasSpecialists || hasAnnualPatients) && (
                            <div className="flex gap-4 text-xs text-slate-500">
                              {hasSpecialists && (
                                <span className="flex items-center gap-1">
                                  <Users size={12} />
                                  {stats.specialists} Specialists
                                </span>
                              )}
                              {hasAnnualPatients && (
                                <span className="flex items-center gap-1">
                                  <Heart size={12} />
                                  {stats.annualPatients?.toLocaleString()} Annual Patients
                                </span>
                              )}
                            </div>
                          )}
                        </button>

                        {/* Expanded detail content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-4 border-t border-slate-100">
                            {/* Department Image */}
                            <div className="pt-3">
                              {(() => {
                                // In edit mode: check pending uploads first, then local state, then original data
                                // In view mode: only use original data from the server
                                const imageUrl = editing
                                  ? (pendingDeptImages.get(deptValue)?.previewUrl || deptImages[deptValue] || info.departmentImages?.[deptValue] || '')
                                  : (info.departmentImages?.[deptValue] || '');
                                return editing ? (
                                  <div className="flex items-start gap-4">
                                    <div className="flex-shrink-0">
                                      {imageUrl ? (
                                        <div className="relative group w-32 h-24 rounded-lg overflow-hidden border border-slate-200">
                                          <img src={imageUrl} alt={deptLabel} className="w-full h-full object-cover" />
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (pendingDeptImages.has(deptValue)) {
                                                const prev = pendingDeptImages.get(deptValue);
                                                if (prev?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(prev.previewUrl);
                                                setPendingDeptImages((p) => { const m = new Map(p); m.delete(deptValue); return m; });
                                              }
                                              setDeptImages((prev) => ({ ...prev, [deptValue]: '' }));
                                            }}
                                            className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                          >
                                            <X size={10} />
                                          </button>
                                        </div>
                                      ) : (
                                        <label className="w-32 h-24 border-2 border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition-colors">
                                          <Camera size={18} className="text-slate-400" />
                                          <span className="text-xs text-slate-400 mt-1">Upload</span>
                                          <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              if (file) {
                                                void readFileAsDataUrl(file).then((previewUrl) => {
                                                  setPendingDeptImages((prev) => {
                                                    const m = new Map(prev);
                                                    m.set(deptValue, { previewUrl, file });
                                                    return m;
                                                  });
                                                  setDeptImages((prev) => ({ ...prev, [deptValue]: previewUrl }));
                                                });
                                              }
                                              e.target.value = '';
                                            }}
                                          />
                                        </label>
                                      )}
                                    </div>
                                    <div className="flex-1">
                                      <label className="block text-xs font-medium text-slate-500 mb-1">Department Image</label>
                                      <p className="text-xs text-slate-400">Upload an image representing this department</p>
                                    </div>
                                  </div>
                                ) : imageUrl ? (
                                  <div className="w-32 h-24 rounded-lg overflow-hidden border border-slate-200">
                                    <img src={imageUrl} alt={deptLabel} className="w-full h-full object-cover" />
                                  </div>
                                ) : null;
                              })()}
                            </div>
                            {/* Department Stats — editing mode */}
                            {editing && (
                              <div className="flex gap-4 pt-3">
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-slate-500 mb-1">
                                    <Users size={10} className="inline mr-1" />
                                    Specialists
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={stats.specialists ?? ''}
                                    onChange={(e) => setDeptStats((prev) => ({
                                      ...prev,
                                      [deptValue]: {
                                        ...prev[deptValue],
                                        specialists: e.target.value ? parseInt(e.target.value) : undefined,
                                      },
                                    }))}
                                    placeholder="0"
                                    className={`${inputClass} h-8 text-sm`}
                                  />
                                </div>
                                <div className="flex-1">
                                  <label className="block text-xs font-medium text-slate-500 mb-1">
                                    <Heart size={10} className="inline mr-1" />
                                    Annual Patients
                                  </label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={stats.annualPatients ?? ''}
                                    onChange={(e) => setDeptStats((prev) => ({
                                      ...prev,
                                      [deptValue]: {
                                        ...prev[deptValue],
                                        annualPatients: e.target.value ? parseInt(e.target.value) : undefined,
                                      },
                                    }))}
                                    placeholder="0"
                                    className={`${inputClass} h-8 text-sm`}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Key Services */}
                            <div className="pt-2">
                              <label className="block text-xs font-medium text-slate-500 mb-1">Key Services</label>
                              {editing ? (
                                <div className="space-y-2">
                                  <div className="rounded-lg border border-slate-200 px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-500/30">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {keyServices.map((svc, idx) => (
                                        <span key={`${svc}-${idx}`} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                                          {svc}
                                          <button
                                            onClick={() => {
                                              const newServices = keyServices.filter((_, i) => i !== idx);
                                              setDeptKeyServices((prev) => ({ ...prev, [deptValue]: newServices }));
                                            }}
                                            className="ml-0.5 text-blue-400 hover:text-red-500"
                                          >
                                            <X size={10} />
                                          </button>
                                        </span>
                                      ))}
                                      <input
                                        value={deptServiceInputs[deptValue] ?? ''}
                                        onChange={(e) => setDeptServiceInputs((prev) => ({ ...prev, [deptValue]: e.target.value }))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
                                            e.preventDefault();
                                            const raw = (deptServiceInputs[deptValue] ?? '').trim();
                                            if (!raw) return;
                                            const newTags = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
                                            const merged = [...keyServices, ...newTags.filter((t) => !keyServices.includes(t))];
                                            setDeptKeyServices((prev) => ({ ...prev, [deptValue]: merged }));
                                            setDeptServiceInputs((prev) => ({ ...prev, [deptValue]: '' }));
                                          }
                                        }}
                                        onBlur={() => {
                                          const raw = (deptServiceInputs[deptValue] ?? '').trim();
                                          if (!raw) return;
                                          const newTags = raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
                                          const merged = [...keyServices, ...newTags.filter((t) => !keyServices.includes(t))];
                                          setDeptKeyServices((prev) => ({ ...prev, [deptValue]: merged }));
                                          setDeptServiceInputs((prev) => ({ ...prev, [deptValue]: '' }));
                                        }}
                                        placeholder="Press Enter/Tab/comma to add tags"
                                        className="h-7 min-w-[180px] flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {keyServices.length > 0 ? keyServices.map((svc, idx) => (
                                    <span key={idx} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                                      {svc}
                                    </span>
                                  )) : (
                                    <span className="text-xs text-slate-400">No key services set</span>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                              {editing ? (
                                <textarea
                                  value={desc}
                                  onChange={(e) => setDeptDescriptions((prev) => ({ ...prev, [deptValue]: e.target.value }))}
                                  placeholder="Describe the department and its capabilities..."
                                  className={`${inputClass} resize-none`}
                                  rows={3}
                                />
                              ) : (
                                <p className="text-sm text-slate-700 whitespace-pre-wrap">{desc || '-'}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Medical Equipment — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader icon={Sparkles} title="Medical Equipment" />
              {editing && (
                <button
                  type="button"
                  onClick={() => setEquipment((prev) => [...prev, { name: '', description: '', imageUrl: '' }])}
                  className="mb-4 inline-flex items-center gap-1 px-3 py-1.5 bg-white text-blue-600 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors"
                >
                  <Plus size={12} /> Add Equipment
                </button>
              )}
              <div className="space-y-4">
                {equipment.map((equip, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-4 space-y-3">
                    {editing ? (
                      <>
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium text-slate-700">Equipment {idx + 1}</label>
                          <button
                            type="button"
                            onClick={() => setEquipment((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Name</label>
                          <input
                            type="text"
                            value={equip.name}
                            onChange={(e) => {
                              const newEquip = [...equipment];
                              const current = newEquip[idx]!;
                              newEquip[idx] = { ...current, name: e.target.value };
                              setEquipment(newEquip);
                            }}
                            placeholder="e.g. Da Vinci Surgical Robot"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
                          <textarea
                            rows={2}
                            value={equip.description}
                            onChange={(e) => {
                              const newEquip = [...equipment];
                              const current = newEquip[idx]!;
                              newEquip[idx] = { ...current, description: e.target.value };
                              setEquipment(newEquip);
                            }}
                            placeholder="Equipment usage and advantages..."
                            className={`${inputClass} resize-none`}
                          />
                        </div>
                        <ImageUploadWidget
                          value={equip.imageUrl}
                          onChange={(url) => {
                            const newEquip = [...equipment];
                            const current = newEquip[idx]!;
                            newEquip[idx] = { ...current, imageUrl: url };
                            setEquipment(newEquip);
                          }}
                          label="Equipment Image"
                          placeholder="https://... or click Upload"
                          previewClassName="h-24 w-32"
                        />
                      </>
                    ) : (
                      <div className="flex gap-4">
                        {equip.imageUrl && (
                          <div className="w-24 h-24 rounded-lg overflow-hidden border border-slate-200 shrink-0">
                            <img src={equip.imageUrl} alt={equip.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="flex-1">
                          <h4 className="font-medium text-slate-800">{equip.name}</h4>
                          {equip.description && (
                            <p className="text-sm text-slate-600 mt-1">{equip.description}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {equipment.length === 0 && !editing && (
                  <div className="h-24 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      <Sparkles size={20} className="mx-auto mb-1" />
                      <span className="text-xs">No equipment added</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Hospital Classification — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader icon={Shield} title="Hospital Classification" />
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  {renderField('Hospital Tier', 'tier', { placeholder: 'e.g. 三甲' })}
                  {renderField('Ownership Type', 'ownershipType', { placeholder: 'e.g. Public' })}
                  {renderField('Hospital Type', 'hospitalType', { placeholder: 'e.g. General' })}
                </div>
              </div>
            </div>
          )}

          {/* Geographic Info — regular_hospital only */}
          {isRegular && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <SectionHeader icon={MapPin} title="Geographic Location" />
              <div className="grid grid-cols-3 gap-4">
                {renderField('Province', 'province', { placeholder: '省份' })}
                {renderField('City', 'city', { placeholder: '城市' })}
                {renderField('District', 'district', { placeholder: '区/县' })}
              </div>
            </div>
          )}
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-6">
          {/* Certifications */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <SectionHeader icon={Shield} title="Certifications & Awards" />
            <div className="space-y-3">
              {certifications.map((cert) => (
                <div key={cert.id} className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg border border-emerald-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Shield size={14} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-slate-800">{cert.name}</p>
                      {cert.year && (
                        <p className="text-xs text-slate-500">Since {cert.year}</p>
                      )}
                    </div>
                  </div>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => setCertifications((prev) => prev.filter((c) => c.id !== cert.id))}
                      className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              {certifications.length === 0 && !editing && (
                <span className="text-sm text-slate-400">No certifications added</span>
              )}
              {editing && (
                <div className="p-4 border-2 border-dashed border-slate-200 rounded-lg">
                  <p className="text-xs text-slate-500 mb-2">Add Certification</p>
                  <div className="space-y-2">
                    <select
                      value={newCertType}
                      onChange={(e) => setNewCertType(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    >
                      <option value="">Select certification type...</option>
                      {CERTIFICATION_PRESETS.map((cert) => (
                        <option key={cert.value} value={cert.value}>{cert.label}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      placeholder="Year (e.g. 2012)"
                      value={newCertYear}
                      onChange={(e) => setNewCertYear(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
                    />
                    <button
                      type="button"
                      disabled={!newCertType}
                      onClick={() => {
                        const certPreset = CERTIFICATION_PRESETS.find((c) => c.value === newCertType);
                        if (certPreset) {
                          setCertifications((prev) => [
                            ...prev,
                            {
                              id: `cert-${Date.now()}`,
                              name: certPreset.label,
                              year: newCertYear ? parseInt(newCertYear) : undefined,
                            },
                          ]);
                          setNewCertType('');
                          setNewCertYear('');
                        }
                      }}
                      className="w-full px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Plus size={14} /> Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Services & Amenities */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <SectionHeader icon={Languages} title="Multilingual Staff" />
              <ChipSelector
                options={LANGUAGE_OPTIONS}
                selected={languages}
                onChange={setLanguages}
                editing={editing}
                label="Select Languages"
              />
            </div>

            <div>
              <SectionHeader icon={Plane} title="Airport Services" />
              <ChipSelector
                options={AIRPORT_SERVICE_OPTIONS}
                selected={airportServices}
                onChange={setAirportServices}
                editing={editing}
                label="Select Airport Services"
              />
            </div>

            <div>
              <SectionHeader icon={Heart} title="Amenities" />
              <ChipSelector
                options={AMENITY_OPTIONS}
                selected={amenities}
                onChange={setAmenities}
                editing={editing}
                label="Select Amenities"
              />
            </div>

            <div>
              <SectionHeader icon={CreditCard} title="Payment Methods" />
              <ChipSelector
                options={PAYMENT_METHOD_OPTIONS}
                selected={paymentMethods}
                onChange={setPaymentMethods}
                editing={editing}
                label="Select Payment Methods"
              />
            </div>

            <div>
              <SectionHeader icon={UserCheck} title="Follow-up Care" />
              <ChipSelector
                options={FOLLOWUP_OPTIONS}
                selected={followupCare}
                onChange={setFollowupCare}
                editing={editing}
                label="Select Follow-up Care"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Department options (regular_hospital) ──────────────────────────
const DEPARTMENT_OPTIONS = [
  { value: 'cardiology', label: 'Cardiology (心血管内科)' },
  { value: 'respiratory', label: 'Respiratory Medicine (呼吸内科)' },
  { value: 'gastroenterology', label: 'Gastroenterology (消化内科)' },
  { value: 'nephrology', label: 'Nephrology (肾内科)' },
  { value: 'neurology', label: 'Neurology (神经内科)' },
  { value: 'endocrinology', label: 'Endocrinology (内分泌科)' },
  { value: 'hematology', label: 'Hematology (血液科)' },
  { value: 'rheumatology', label: 'Rheumatology (风湿免疫科)' },
  { value: 'general_surgery', label: 'General Surgery (普外科)' },
  { value: 'orthopedics', label: 'Orthopedics (骨科)' },
  { value: 'neurosurgery', label: 'Neurosurgery (神经外科)' },
  { value: 'cardiothoracic', label: 'Cardiothoracic Surgery (心胸外科)' },
  { value: 'urology', label: 'Urology (泌尿外科)' },
  { value: 'vascular', label: 'Vascular Surgery (血管外科)' },
  { value: 'obgyn', label: 'Obstetrics & Gynecology (妇产科)' },
  { value: 'pediatrics', label: 'Pediatrics (儿科)' },
  { value: 'neonatology', label: 'Neonatology (新生儿科)' },
  { value: 'ophthalmology', label: 'Ophthalmology (眼科)' },
  { value: 'ent', label: 'ENT (耳鼻喉科)' },
  { value: 'stomatology', label: 'Stomatology (口腔科)' },
  { value: 'dermatology', label: 'Dermatology (皮肤科)' },
  { value: 'tcm', label: 'Traditional Chinese Medicine (中医科)' },
  { value: 'rehabilitation', label: 'Rehabilitation (康复科)' },
  { value: 'oncology', label: 'Oncology (肿瘤科)' },
  { value: 'emergency', label: 'Emergency (急诊科)' },
  { value: 'icu', label: 'ICU (重症医学科)' },
  { value: 'infectious', label: 'Infectious Disease (感染科)' },
  { value: 'psychiatry', label: 'Psychiatry (精神科)' },
  { value: 'radiology', label: 'Radiology (放射科)' },
  { value: 'laboratory', label: 'Laboratory (检验科)' },
  { value: 'pathology', label: 'Pathology (病理科)' },
  { value: 'pharmacy', label: 'Pharmacy (药剂科)' },
  { value: 'anesthesiology', label: 'Anesthesiology (麻醉科)' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 2 — Procedures                                                        */
/* ═══════════════════════════════════════════════════════════════════════════ */

function ProceduresTab() {
  const { data, isLoading } = useProcedures();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsProcedureDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const allProcedures: MaterialsProcedureDTO[] = (data as MaterialsProcedureDTO[] | undefined) ?? [];
  const procedures = allProcedures.filter(
    (p) => !searchQuery || p.procedureName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleDeleteProcedure = async (id: string) => {
    if (!confirm('Delete this procedure?')) return;
    await deleteProcedure(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search procedures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500"
          />
        </div>
        <button
          onClick={() => {
            setEditingItem(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm shadow-cyan-500/20 transition-all"
        >
          <Plus size={16} /> Add Procedure
        </button>
      </div>

      {procedures.length === 0 ? (
        <EmptyState
          icon={<Stethoscope size={48} />}
          title="No procedures yet"
          description="Add your first procedure to get started."
          action={
            <Button
              onClick={() => {
                setEditingItem(null);
                setShowModal(true);
              }}
              className="gap-2"
            >
              <Plus size={16} /> Add Procedure
            </Button>
          }
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
              <tr>
                <th className="px-6 py-4 font-medium">Procedure Name</th>
                <th className="px-6 py-4 font-medium">Price Range</th>
                <th className="px-6 py-4 font-medium">Tags</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {procedures.map((proc) => (
                <tr key={proc.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-slate-900">{proc.procedureName}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {proc.priceMin != null || proc.priceMax != null
                      ? `USD ${(proc.priceMin ?? 0).toLocaleString()} - ${(proc.priceMax ?? 0).toLocaleString()}`
                      : proc.priceRange ?? '-'}
                  </td>
                  <td className="px-6 py-4">
                    {proc.isPopular && (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200/50 rounded-md text-xs font-medium">
                        Popular
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-md text-xs font-medium">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(proc);
                          setShowModal(true);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteProcedure(proc.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <ProcedureModal
          open={showModal}
          onClose={() => {
            setShowModal(false);
            setEditingItem(null);
          }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function ProcedureModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsProcedureDTO | null;
}) {
  const [procedureName, setProcedureName] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [isPopular, setIsPopular] = useState(false);
  const [sortOrder, setSortOrder] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setProcedureName(existing?.procedureName ?? '');
    setPriceMin(existing?.priceMin != null ? String(existing.priceMin) : '');
    setPriceMax(existing?.priceMax != null ? String(existing.priceMax) : '');
    setIsPopular(existing?.isPopular ?? false);
    setSortOrder(existing?.sortOrder != null ? String(existing.sortOrder) : '');
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!procedureName.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        procedureName: procedureName.trim(),
        priceMin: priceMin ? Number(priceMin) : null,
        priceMax: priceMax ? Number(priceMax) : null,
        isPopular,
        sortOrder: sortOrder ? Number(sortOrder) : 0,
      };
      if (existing) {
        await updateProcedure(existing.id, payload);
      } else {
        await createProcedure(payload);
      }
      onClose();
    } catch {
      // Error handled upstream
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500';

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Procedure' : 'Add New Procedure'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Procedure Name</label>
          <input
            type="text"
            value={procedureName}
            onChange={(e) => setProcedureName(e.target.value)}
            required
            className={inputClass}
            placeholder="e.g. Rhinoplasty"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Currency</label>
            <select className={inputClass}>
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>CNY</option>
              <option>THB</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Min Price</label>
            <input
              type="number"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              placeholder="e.g. 5000"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max Price</label>
            <input
              type="number"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              placeholder="e.g. 8000"
              className={inputClass}
            />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="isPopularProc"
            checked={isPopular}
            onChange={(e) => setIsPopular(e.target.checked)}
            className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500"
          />
          <label htmlFor="isPopularProc" className="text-sm font-medium text-slate-700">
            Mark as Popular Procedure
          </label>
        </div>
        <div className="pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !procedureName.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-xl transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Save Procedure'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 3 — Surgeons                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

function SurgeonsTab() {
  const { data, isLoading } = useSurgeons();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsSurgeonDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const allSurgeons: MaterialsSurgeonDTO[] = (data as MaterialsSurgeonDTO[] | undefined) ?? [];
  const surgeons = allSurgeons.filter(
    (s) => !searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this surgeon?')) return;
    await deleteSurgeon(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search surgeons..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>
        <button
          onClick={() => {
            setEditingItem(null);
            setShowModal(true);
          }}
          className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm shadow-purple-500/20 transition-all"
        >
          <Plus size={16} /> Add Surgeon
        </button>
      </div>

      {surgeons.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="No surgeons yet"
          description="Add your surgeons to showcase your team."
          action={
            <Button
              onClick={() => {
                setEditingItem(null);
                setShowModal(true);
              }}
              className="gap-2"
            >
              <Plus size={16} /> Add Surgeon
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {surgeons.map((surgeon) => (
            <div
              key={surgeon.id}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex gap-6"
            >
              <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-slate-100 border border-slate-200">
                {surgeon.imageUrl ? (
                  <img src={surgeon.imageUrl} alt={surgeon.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400">
                    <Users size={32} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 truncate">{surgeon.name}</h3>
                    {surgeon.title && <p className="text-sm text-slate-500">{surgeon.title}</p>}
                  </div>
                  <button className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md">
                    <MoreVertical size={16} />
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  {surgeon.experienceYears != null && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">Experience:</span> {surgeon.experienceYears} Years
                    </div>
                  )}
                  {surgeon.specialties.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">Specialties:</span>
                      <div className="flex gap-1 flex-wrap">
                        {surgeon.specialties.map((s) => (
                          <span key={s} className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {surgeon.languages.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="font-medium text-slate-900">Languages:</span> {surgeon.languages.join(', ')}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-md text-xs font-medium">
                    Published
                  </span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setEditingItem(surgeon); setShowModal(true); }}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700"
                    >
                      Edit Profile
                    </button>
                    <button
                      onClick={() => handleDelete(surgeon.id)}
                      className="text-xs font-medium text-rose-600 hover:text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <SurgeonModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function SurgeonModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsSurgeonDTO | null;
}) {
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [languages, setLanguages] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setName(existing?.name ?? '');
    setTitle(existing?.title ?? '');
    setImageUrl(existing?.imageUrl ?? '');
    setExperienceYears(existing?.experienceYears != null ? String(existing.experienceYears) : '');
    setSpecialties((existing?.specialties ?? []).join(', '));
    setLanguages((existing?.languages ?? []).join(', '));
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        title: title.trim() || null,
        imageUrl: imageUrl.trim() || null,
        experienceYears: experienceYears ? Number(experienceYears) : null,
        specialties: specialties ? specialties.split(',').map((s) => s.trim()).filter(Boolean) : [],
        languages: languages ? languages.split(',').map((s) => s.trim()).filter(Boolean) : [],
      };
      if (existing) {
        await updateSurgeon(existing.id, payload);
      } else {
        await createSurgeon(payload);
      }
      onClose();
    } catch {
      // Error handled upstream
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500';

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Surgeon' : 'Add New Surgeon'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <ImageUploadWidget
          value={imageUrl}
          onChange={setImageUrl}
          label="Profile Photo"
          placeholder="https://... or click Upload"
          compact
        />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Dr. First Last" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Title / Position</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Chief of Surgery" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Years of Experience</label>
            <input type="number" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="e.g. 15" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Languages</label>
            <input type="text" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="e.g. English, Spanish" className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Specialties</label>
          <input type="text" value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="e.g. Cardiology, Heart Transplant (comma separated)" className={inputClass} />
        </div>
        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
          <button type="submit" disabled={submitting || !name.trim()} className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-xl transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Surgeon'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Tab 4 — Cases Before & After                                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function BeforeAfterTab() {
  const { data, isLoading } = useBeforeAfterCases();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialsBeforeAfterCaseDTO | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const allCases: MaterialsBeforeAfterCaseDTO[] = (data as MaterialsBeforeAfterCaseDTO[] | undefined) ?? [];
  const cases = allCases.filter(
    (c) => !searchQuery || c.procedureName.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this before & after case?')) return;
    await deleteBeforeAfterCase(id);
    await queryClient.invalidateQueries({ queryKey: ['materials', 'cases'] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search cases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
          />
        </div>
        <button
          onClick={() => { setEditingItem(null); setShowModal(true); }}
          className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm shadow-amber-500/20 transition-all"
        >
          <Plus size={16} /> Add Case
        </button>
      </div>

      {cases.length === 0 ? (
        <EmptyState
          icon={<Camera size={48} />}
          title="No before & after cases"
          description="Add cases to showcase your results."
          action={
            <Button onClick={() => { setEditingItem(null); setShowModal(true); }} className="gap-2">
              <Plus size={16} /> Add Case
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cases.map((c) => {
            const beforeImg = c.images.find((img) => img.type === 'before');
            const afterImg = c.images.find((img) => img.type === 'after');

            return (
              <div key={c.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                {/* Side-by-side Before/After images */}
                <div className="h-40 bg-slate-100 relative flex">
                  <div className="w-1/2 h-full relative">
                    {beforeImg ? (
                      <img src={beforeImg.url} alt="Before" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 text-white text-[10px] font-medium rounded backdrop-blur-sm">
                      Before
                    </div>
                  </div>
                  <div className="w-1/2 h-full relative border-l border-white/20">
                    {afterImg ? (
                      <img src={afterImg.url} alt="After" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon size={32} />
                      </div>
                    )}
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/50 text-white text-[10px] font-medium rounded backdrop-blur-sm">
                      After
                    </div>
                  </div>
                </div>
                {/* Details */}
                <div className="p-5 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-slate-900">{c.procedureName || 'Procedure'}</h3>
                    <button className="text-slate-400 hover:text-slate-600">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-sm text-slate-600 mb-4 flex-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Surgeon:</span>
                      <span className="font-medium text-slate-900">{c.surgeonName ?? 'Not specified'}</span>
                    </div>
                    {c.description && <p className="text-xs text-slate-500 mt-1">{c.description}</p>}
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-md text-xs font-medium">
                      Published
                    </span>
                    <div className="flex gap-3">
                      <button
                        onClick={() => { setEditingItem(c); setShowModal(true); }}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Edit Case
                      </button>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <BeforeAfterModal
          open={showModal}
          onClose={() => { setShowModal(false); setEditingItem(null); }}
          existing={editingItem}
        />
      )}
    </div>
  );
}

function BeforeAfterModal({
  open,
  onClose,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  existing: MaterialsBeforeAfterCaseDTO | null;
}) {
  const queryClient = useQueryClient();
  const [procedureName, setProcedureName] = useState('');
  const [surgeonName, setSurgeonName] = useState('');
  const [beforeImageUrl, setBeforeImageUrl] = useState('');
  const [afterImageUrl, setAfterImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setProcedureName(existing?.procedureName ?? '');
    setSurgeonName(existing?.surgeonName ?? '');
    const beforeImg = existing?.images.find((img) => img.type === 'before');
    const afterImg = existing?.images.find((img) => img.type === 'after');
    setBeforeImageUrl(beforeImg?.url ?? '');
    setAfterImageUrl(afterImg?.url ?? '');
    setDescription(existing?.description ?? '');
  }, [existing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const images: Array<{ url: string; type: 'before' | 'after' | 'combined' }> = [];
      if (existing) {
        for (const img of existing.images) {
          if (img.type === 'combined') images.push(img);
        }
      }
      if (beforeImageUrl.trim()) images.push({ url: beforeImageUrl.trim(), type: 'before' });
      if (afterImageUrl.trim()) images.push({ url: afterImageUrl.trim(), type: 'after' });

      const payload: Record<string, unknown> = {
        procedureName: procedureName.trim() || undefined,
        surgeonName: surgeonName.trim() || null,
        description: description.trim() || null,
        images,
      };
      if (existing) {
        await updateBeforeAfterCase(existing.id, payload);
      } else {
        await createBeforeAfterCase(payload);
      }
      await queryClient.invalidateQueries({ queryKey: ['materials', 'cases'] });
      onClose();
    } catch {
      // Error handled upstream
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500';

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Edit Case' : 'Add New Case Study'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Procedure</label>
            <input type="text" value={procedureName} onChange={(e) => setProcedureName(e.target.value)} placeholder="e.g. Rhinoplasty" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Lead Surgeon</label>
            <input type="text" value={surgeonName} onChange={(e) => setSurgeonName(e.target.value)} placeholder="e.g. Dr. Sarah Jenkins" className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Case Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Describe the procedure and outcome..." className={`${inputClass} resize-none`} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ImageUploadWidget
            value={beforeImageUrl}
            onChange={setBeforeImageUrl}
            label="Before Image"
            placeholder="https://... or upload"
            compact
          />
          <ImageUploadWidget
            value={afterImageUrl}
            onChange={setAfterImageUrl}
            label="After Image"
            placeholder="https://... or upload"
            compact
          />
        </div>
        <div className="pt-4 flex justify-end gap-3 border-t border-slate-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">Cancel</button>
          <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 rounded-xl transition-colors disabled:opacity-50">
            {submitting ? 'Saving...' : 'Save Case'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
