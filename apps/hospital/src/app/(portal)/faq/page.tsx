'use client';

import { FaqList } from '@/components/faq-list';
import { useHospitalI18n } from '@/lib/hospital-i18n';

export default function FaqPage() {
  const { t } = useHospitalI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">
          {t('hospital.faq.page.title', undefined, 'Chatbot & FAQ')}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t(
            'hospital.faq.page.description',
            undefined,
            'Manage frequently asked questions for AI chatbot',
          )}
        </p>
      </div>
      <FaqList />
    </div>
  );
}
