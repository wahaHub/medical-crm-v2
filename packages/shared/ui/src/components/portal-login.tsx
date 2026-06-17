'use client';

import { useState } from 'react';

type LoginResponse = {
  success?: boolean;
  redirectTo?: string;
  details?: string;
  errorCode?: string;
  error?: string;
};

export type PortalLoginProps = {
  title?: string;
  subtitle?: string;
  formTitle?: string;
  usernameLabel?: string;
  usernamePlaceholder?: string;
  passwordLabel?: string;
  passwordPlaceholder?: string;
  submitLabel?: string;
  submittingLabel?: string;
  genericLoginFailedMessage?: string;
  genericLoginErrorMessage?: string;
  missingCredentialsMessage?: string;
  invalidCredentialsMessage?: string;
  unauthorizedMessage?: string;
  alternatePortalLabel?: string;
  forgotPasswordHref?: string;
  forgotPasswordLabel?: string;
};

export function PortalLogin({
  title = 'Medical CRM',
  subtitle = 'Unified Portal Login',
  formTitle = 'Sign in to your account',
  usernameLabel = 'Username / Email',
  usernamePlaceholder = 'Enter username or email',
  passwordLabel = 'Password',
  passwordPlaceholder = 'Enter password',
  submitLabel = 'Sign In',
  submittingLabel = 'Signing in...',
  genericLoginFailedMessage = 'Login failed',
  genericLoginErrorMessage = 'An error occurred during login',
  missingCredentialsMessage = 'Username and password are required',
  invalidCredentialsMessage = 'Invalid credentials',
  unauthorizedMessage = 'This account is not authorized for this portal',
  alternatePortalLabel,
  forgotPasswordHref,
  forgotPasswordLabel = 'Forgot password?',
}: PortalLoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getLoginErrorCode = (response: LoginResponse) => response.errorCode ?? response.error;

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
        credentials: 'same-origin',
      });

      const data = (await response.json()) as LoginResponse;
      if (response.ok && data.success) {
        window.location.href = data.redirectTo || '/';
        return;
      }

      const errorCode = getLoginErrorCode(data);
      const errorMessage = errorCode === 'LOGIN_FIELDS_REQUIRED'
        ? missingCredentialsMessage
        : errorCode === 'INVALID_CREDENTIALS'
          ? invalidCredentialsMessage
          : errorCode === 'LOGIN_NOT_AUTHORIZED'
            ? unauthorizedMessage
            : response.ok
              ? genericLoginFailedMessage
              : genericLoginErrorMessage;

      setError(errorMessage);
      setRedirectTo(data.redirectTo || null);
      setIsSubmitting(false);
    } catch {
      setError(genericLoginErrorMessage);
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
            {formTitle}
          </h2>

          {error && (
            <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
                {usernameLabel}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                placeholder={usernamePlaceholder}
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                  {passwordLabel}
                </label>
                {forgotPasswordHref && (
                  <a
                    href={forgotPasswordHref}
                    className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                  >
                    {forgotPasswordLabel}
                  </a>
                )}
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50"
                placeholder={passwordPlaceholder}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition hover:from-teal-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              <span>{isSubmitting ? submittingLabel : submitLabel}</span>
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
