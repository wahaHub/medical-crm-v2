import { EmailTemplatesList } from '@/components/email-templates-list';

export default function EmailTemplatesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Email Templates</h1>
        <p className="text-sm text-slate-500 mt-1">Manage email templates for patient communications</p>
      </div>
      <EmailTemplatesList />
    </div>
  );
}
