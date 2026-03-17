'use client';

import { useState } from 'react';
import { Tabs } from '@medical-crm/ui';
import { CaseOverviewTab } from './tabs/case-overview-tab';
import { CaseIntakeTab } from './tabs/case-intake-tab';
import type { CaseSummary } from '@/lib/api-types';

const TAB_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'quotes', label: 'Multi-Hospital Quotes' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'messages', label: 'Messages' },
  { key: 'intake', label: 'Medical Intake' },
  { key: 'journey', label: 'Journey' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'orders', label: 'Orders' },
  { key: 'support', label: 'Support' },
  { key: 'ai-summary', label: 'AI Summary' },
];

function PlaceholderTab({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
      {label} — coming soon
    </div>
  );
}

interface CaseDetailTabsProps {
  caseData: CaseSummary;
}

export function CaseDetailTabs({ caseData }: CaseDetailTabsProps) {
  const [activeKey, setActiveKey] = useState('overview');

  const activeTab = TAB_ITEMS.find((t) => t.key === activeKey);

  return (
    <div className="space-y-6">
      <Tabs items={TAB_ITEMS} activeKey={activeKey} onChange={setActiveKey} />

      <div>
        {activeKey === 'overview' && <CaseOverviewTab caseData={caseData} />}
        {activeKey === 'intake' && <CaseIntakeTab caseId={caseData.id} />}
        {activeKey !== 'overview' && activeKey !== 'intake' && (
          <PlaceholderTab label={activeTab?.label ?? activeKey} />
        )}
      </div>
    </div>
  );
}
