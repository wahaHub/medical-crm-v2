'use client';

import { useState } from 'react';
import { MessagesCenter } from '@/components/messages-center';

interface CaseMessagesTabProps {
  caseId: string;
}

const SECTION_TABS = [
  { key: 'admin', label: 'Admin Conversations' },
  { key: 'hospital', label: 'Hospital Conversations' },
] as const;

export function CaseMessagesTab({ caseId }: CaseMessagesTabProps) {
  const [activeSection, setActiveSection] = useState<'admin' | 'hospital'>('admin');

  return (
    <div className="space-y-4">
      {/* Section tabs */}
      <div className="flex border-b border-slate-200">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`px-6 pb-3 text-sm font-semibold transition-all border-b-2 ${
              activeSection === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Admin conversations: ADMIN_HOSPITAL + ADMIN_PATIENT */}
      {activeSection === 'admin' && (
        <MessagesCenter
          caseId={caseId}
          showSearch={false}
          showCategoryFilter={false}
          showInfoPanel={false}
          allowCreateConversation={false}
          groupByCategorySections
          containerHeightClassName="h-[560px]"
          leftPanelWidthClassName="w-72"
          listTitle="Admin Conversations"
          emptyListMessage="No admin conversations for this case yet."
          includedCategories={['ADMIN_HOSPITAL', 'ADMIN_PATIENT']}
        />
      )}

      {/* Hospital conversations: HOSPITAL_PATIENT */}
      {activeSection === 'hospital' && (
        <MessagesCenter
          caseId={caseId}
          showSearch={false}
          showCategoryFilter={false}
          showInfoPanel={false}
          allowCreateConversation={false}
          groupByCategorySections={false}
          containerHeightClassName="h-[560px]"
          leftPanelWidthClassName="w-72"
          listTitle="Hospital Conversations"
          emptyListMessage="No hospital conversations for this case yet."
          includedCategories={['HOSPITAL_PATIENT']}
          readOnly
        />
      )}
    </div>
  );
}
