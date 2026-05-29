'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, KeyRound, LockKeyhole, ShieldAlert } from 'lucide-react';

type TokenData = {
  email: string;
  hospitalName: string;
  expiresAt: string;
};

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-white to-emerald-50 p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function BrandHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-7 text-center">
      <img src="/medora_logo.png" alt="Medora" className="mx-auto mb-4 h-12 w-auto" />
      <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoading />}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordLoading() {
  return (
    <AuthShell>
      <div className="rounded-2xl border border-teal-100 bg-white p-8 shadow-xl">
        <BrandHeader title="验证重置链接" subtitle="正在检查链接是否仍然有效。" />
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
      </div>
    </AuthShell>
  );
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [state, setState] = useState<'loading' | 'form' | 'success' | 'error'>('loading');
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('缺少重置链接，请从邮件中的按钮重新进入。');
      setState('error');
      return;
    }

    const validateToken = async () => {
      try {
        const res = await fetch(`/api/auth/hospital/reset-password?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as TokenData & { error?: string };

        if (!res.ok) {
          setError(data.error ?? '重置链接无效或已过期。');
          setState('error');
          return;
        }

        setTokenData(data);
        setState('form');
      } catch {
        setError('验证重置链接失败，请稍后重试。');
        setState('error');
      }
    };

    void validateToken();
  }, [token]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;

    if (password.length < 8) {
      setError('新密码至少需要 8 个字符。');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的新密码不一致。');
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/hospital/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? '密码重置失败，请重新申请链接。');
        setSubmitting(false);
        return;
      }

      setState('success');
    } catch {
      setError('密码重置失败，请稍后再试。');
      setSubmitting(false);
    }
  }

  if (state === 'loading') return <ResetPasswordLoading />;

  if (state === 'error') {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-rose-100 bg-white p-8 shadow-xl">
          <BrandHeader title="链接不可用" subtitle="为了账户安全，请重新申请密码重置邮件。" />
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100">
                <ShieldAlert className="h-5 w-5 text-rose-700" />
              </div>
              <p className="text-sm leading-6 text-rose-800">{error}</p>
            </div>
          </div>
          <a
            href="/auth/forgot-password"
            className="mt-5 flex items-center justify-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            <ArrowLeft className="h-4 w-4" />
            重新发送重置链接
          </a>
        </div>
      </AuthShell>
    );
  }

  if (state === 'success') {
    return (
      <AuthShell>
        <div className="rounded-2xl border border-emerald-100 bg-white p-8 shadow-xl">
          <BrandHeader title="密码已更新" subtitle="您现在可以使用新密码登录医院端。" />
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              </div>
              <p className="text-sm leading-6 text-emerald-800">
                密码重置成功。为了账户安全，此链接已经失效。
              </p>
            </div>
          </div>
          <a
            href="/auth/login"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition hover:from-teal-600 hover:to-emerald-700"
          >
            <KeyRound className="h-4 w-4" />
            返回登录
          </a>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-2xl border border-teal-100 bg-white p-8 shadow-xl">
        <BrandHeader title="设置新密码" subtitle="安全链接已验证，请输入新的医院端登录密码。" />
        {tokenData && (
          <div className="mb-5 rounded-xl border border-teal-200 bg-teal-50 p-4">
            <p className="text-sm font-semibold text-teal-900">{tokenData.hospitalName}</p>
            <p className="mt-1 text-xs text-teal-700">{tokenData.email}</p>
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}
        <form onSubmit={(event) => { void handleSubmit(event); }} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
              新密码
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                required
                className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                placeholder="至少 8 个字符"
              />
            </div>
          </div>
          <div>
            <label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-700">
              确认新密码
            </label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={submitting}
                required
                className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                placeholder="再次输入新密码"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition hover:from-teal-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            ) : (
              <KeyRound className="h-4 w-4" />
            )}
            {submitting ? '更新中...' : '更新密码'}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
