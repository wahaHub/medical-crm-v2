'use client';

import { useState } from 'react';

type LoginResponse = {
  success?: boolean;
  redirectTo?: string;
  details?: string;
  error?: string;
};

export type PortalLoginProps = {
  title?: string;
  subtitle?: string;
  alternatePortalLabel?: string;
};

export function PortalLogin({
  title = 'Medical CRM',
  subtitle = 'Unified Portal Login',
  alternatePortalLabel,
}: PortalLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setRedirectTo(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = (await response.json()) as LoginResponse;
      if (response.ok && data.success) {
        window.location.href = data.redirectTo || '/';
        return;
      }

      setError(data.details || data.error || 'Login failed');
      setRedirectTo(data.redirectTo || null);
      setIsSubmitting(false);
    } catch {
      setError('An error occurred during login');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src="/medora_logo.png"
            alt="Medora"
            className="mx-auto mb-4 h-12 w-auto"
          />
          <h1 className="mb-2 text-2xl font-bold text-slate-800">{title}</h1>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>

        <div className="rounded-2xl border border-teal-100 bg-white p-8 shadow-xl">
          <h2 className="mb-5 text-center text-lg font-semibold text-slate-800">
            Sign in to your account
          </h2>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
                Username / Email
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                placeholder="Enter username or email"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                placeholder="Enter password"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition hover:from-teal-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              <span>{isSubmitting ? 'Signing in...' : 'Sign In'}</span>
            </button>
          </form>

          {redirectTo && alternatePortalLabel && (
            <a
              href={redirectTo}
              className="mt-4 block text-center text-sm font-medium text-teal-700 hover:text-teal-800"
            >
              {alternatePortalLabel}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
