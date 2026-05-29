'use client';

import { useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from 'lucide-react';

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="mb-7 text-center">
      <img src="/medora_logo.png" alt="Medora" className="mx-auto mb-4 h-12 w-auto" />
      <h1 className="text-2xl font-bold text-slate-800">找回医院端密码</h1>
      <p className="mt-2 text-sm text-slate-500">我们会发送一个安全链接到您的账户邮箱。</p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setState('submitting');

    try {
      const res = await fetch('/api/auth/hospital/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        setError('请输入有效的邮箱地址。');
        setState('idle');
        return;
      }

      setState('sent');
    } catch {
      setError('发送失败，请稍后再试。');
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-xl">
          <BrandHeader />
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-emerald-900">重置邮件已发送</h2>
                <p className="mt-1 text-sm leading-6 text-emerald-800">
                  如果该邮箱属于医院端账户，您会收到一封包含安全链接的邮件。
                </p>
              </div>
            </div>
          </div>
          <a
            href="/auth/login"
            className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-2xl border border-teal-100 bg-white p-8 shadow-xl">
        <BrandHeader />
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        <form onSubmit={(event) => { void handleSubmit(event); }} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
              账户邮箱
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={state === 'submitting'}
                required
                className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                placeholder="name@hospital.com"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={state === 'submitting'}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition hover:from-teal-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state === 'submitting' ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {state === 'submitting' ? '发送中...' : '发送重置链接'}
          </button>
        </form>
        <a
          href="/auth/login"
          className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800"
        >
          <ArrowLeft className="h-4 w-4" />
          返回登录
        </a>
      </div>
    </AuthShell>
  );
}
