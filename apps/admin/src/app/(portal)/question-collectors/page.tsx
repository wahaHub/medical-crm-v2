import { PageHeader } from '@medical-crm/ui';
import { QcTemplatesList } from '@/components/qc-templates-list';

export default function QuestionCollectorsPage() {
  return (
    <>
      <PageHeader title="Question Collectors" />
      <QcTemplatesList />
    </>
  );
}
