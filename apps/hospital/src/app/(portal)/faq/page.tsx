import { FaqList } from '@/components/faq-list';

export default function FaqPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-800">Chatbot & FAQ</h1>
        <p className="text-sm text-slate-500 mt-1">Manage frequently asked questions for AI chatbot</p>
      </div>
      <FaqList />
    </div>
  );
}
