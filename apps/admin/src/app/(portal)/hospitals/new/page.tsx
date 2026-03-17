import { PageHeader } from '@medical-crm/ui';
import { NewHospitalForm } from '@/components/new-hospital-form';

export default function NewHospitalPage() {
  return (
    <>
      <PageHeader title="New Hospital" />
      <NewHospitalForm />
    </>
  );
}
