'use client';

import { useState } from 'react';
import { Tabs } from '@medical-crm/ui';
import { CaseOverviewTab } from './tabs/case-overview-tab';
import { CaseIntakeTab } from './tabs/case-intake-tab';
import { CaseQuotesTab } from './tabs/case-quotes-tab';
import { CaseTimelineTab } from './tabs/case-timeline-tab';
import { CaseMessagesTab } from './tabs/case-messages-tab';
import { CaseJourneyTab } from './tabs/case-journey-tab';
import { CaseConsultationsTab } from './tabs/case-consultations-tab';
import { CaseOrdersTab } from './tabs/case-orders-tab';
import { CaseSupportTab } from './tabs/case-support-tab';
import { CaseAiSummaryTab } from './tabs/case-ai-summary-tab';
import { CaseBeautyTab } from './tabs/case-beauty-tab';
import type { CaseSummary } from '@/lib/api-types';

const TAB_ITEMS = [
  { key: 'overview', label: 'Overview' },
  { key: 'quotes', label: 'Multi-Hospital Quotes' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'messages', label: 'Messages' },
  { key: 'beauty', label: 'Beauty Intake' },
  { key: 'intake', label: 'Medical Intake' },
  { key: 'journey', label: 'Journey' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'orders', label: 'Orders' },
  { key: 'support', label: 'Support' },
  { key: 'ai-summary', label: 'AI Summary' },
];

interface CaseDetailTabsProps {
  caseData: CaseSummary;
}

export function CaseDetailTabs({ caseData }: CaseDetailTabsProps) {
  const [activeKey, setActiveKey] = useState('overview');

  return (
    <div className="space-y-6">
      <Tabs items={TAB_ITEMS} activeKey={activeKey} onChange={setActiveKey} />

      <div>
        {activeKey === 'overview' && <CaseOverviewTab caseData={caseData} />}
        {activeKey === 'intake' && <CaseIntakeTab caseId={caseData.id} />}
        {activeKey === 'quotes' && <CaseQuotesTab caseId={caseData.id} />}
        {activeKey === 'timeline' && <CaseTimelineTab caseId={caseData.id} />}
        {activeKey === 'messages' && <CaseMessagesTab caseId={caseData.id} />}
        {activeKey === 'beauty' && <CaseBeautyTab caseId={caseData.id} />}
        {activeKey === 'journey' && <CaseJourneyTab caseId={caseData.id} />}
        {activeKey === 'consultations' && <CaseConsultationsTab caseId={caseData.id} />}
        {activeKey === 'orders' && <CaseOrdersTab caseId={caseData.id} />}
        {activeKey === 'support' && <CaseSupportTab caseId={caseData.id} />}
        {activeKey === 'ai-summary' && (
          <CaseAiSummaryTab aiSummary={caseData.aiSummary} />
        )}
      </div>
    </div>
  );
}
