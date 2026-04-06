'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface TokenData {
  hospitalName: string;
  hospitalNameEn?: string | null;
  email: string;
  expiresAt: string;
}

const HOSPITAL_PORTAL_LOGIN_URL =
  process.env.NEXT_PUBLIC_HOSPITAL_PORTAL_LOGIN_URL ?? 'http://localhost:3003/auth/login';

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-white to-emerald-50 flex items-center justify-center p-4">
      {children}
    </div>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-full max-w-md rounded-2xl bg-white shadow-xl border ${className}`}>
      {children}
    </div>
  );
}

function BrandHeader() {
  return (
    <div className="text-center space-y-3">
      <img
        src="/medora_logo.png"
        alt="Medora"
        className="mx-auto h-14 w-auto"
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-800">Hospital Account Registration</h1>
        <p className="text-sm text-slate-500">Welcome to Medora Health Medical Case Management</p>
      </div>
    </div>
  );
}

export default function HospitalRegisterPage() {
  return (
    <Suspense fallback={<RegisterPageLoading />}>
      <HospitalRegisterPageContent />
    </Suspense>
  );
}

function RegisterPageLoading() {
  return (
    <PageWrapper>
      <Card>
        <div className="flex flex-col items-center gap-4 p-8">
          <img
            src="/medora_logo.png"
            alt="Medora"
            className="h-12 w-auto"
          />
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
          <p className="text-slate-600 text-sm">Verifying your registration link...</p>
        </div>
      </Card>
    </PageWrapper>
  );
}

function HospitalRegisterPageContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<'loading' | 'form' | 'success' | 'error'>('loading');
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({ username: '', password: '', confirmPassword: '' });

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setErrorMessage('Missing registration token. Please use the invitation link sent to your email.');
      setState('error');
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch(`/api/auth/hospital/register?token=${encodeURIComponent(token)}`);
        const data = (await res.json()) as TokenData & { error?: string; code?: string };

        if (!res.ok) {
          setErrorMessage(data.error ?? 'Invalid or expired registration link.');
          setState('error');
          return;
        }

        setTokenData(data);
        setState('form');
      } catch {
        setErrorMessage('Failed to verify the registration link. Please try again.');
        setState('error');
      }
    };

    void verify();
  }, [token]);

  function validate(): boolean {
    const errors = { username: '', password: '', confirmPassword: '' };
    if (!username) {
      errors.username = 'Username is required.';
    } else if (username.length < 3) {
      errors.username = 'Username must be at least 3 characters.';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      errors.username = 'Username may only contain letters, numbers, underscores, and hyphens.';
    }
    if (!password) {
      errors.password = 'Password is required.';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters.';
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password.';
    } else if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match.';
    }
    setFieldErrors(errors);
    return !errors.username && !errors.password && !errors.confirmPassword;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/auth/hospital/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, username, password }),
      });

      const data = (await res.json()) as { code?: string; error?: string };

      if (!res.ok) {
        if (data.code === 'CONFLICT' && data.error?.toLowerCase().includes('username')) {
          setFieldErrors((prev) => ({ ...prev, username: 'This username is already taken.' }));
        } else if (data.code === 'CONFLICT' && data.error?.toLowerCase().includes('email')) {
          setSubmitError('This email has already been registered.');
        } else {
          setSubmitError(data.error ?? 'Registration failed. Please try again.');
        }
        setSubmitting(false);
        return;
      }

      setState('success');
      // Redirect to Hospital Portal login after 3 seconds.
      setTimeout(() => {
        window.location.href = HOSPITAL_PORTAL_LOGIN_URL;
      }, 3000);
    } catch {
      setSubmitError('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  }

  // ---- Loading ----
  if (state === 'loading') {
    return <RegisterPageLoading />;
  }

  // ---- Error (invalid token) ----
  if (state === 'error') {
    return (
      <PageWrapper>
        <Card className="border-red-200">
          <div className="p-8 space-y-4">
            <BrandHeader />
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-red-700">Invalid Registration Link</h2>
                <p className="text-sm text-slate-500 mt-0.5">{errorMessage}</p>
              </div>
            </div>
            <ul className="list-disc list-inside text-sm text-slate-600 space-y-1 pl-1">
              <li>The link may have expired</li>
              <li>The link may have already been used</li>
              <li>The link may be invalid or malformed</li>
            </ul>
            <p className="text-sm text-slate-500">
              Please contact your administrator to request a new invitation.
            </p>
          </div>
        </Card>
      </PageWrapper>
    );
  }

  // ---- Success ----
  if (state === 'success') {
    return (
      <PageWrapper>
        <Card className="border-emerald-200">
          <div className="p-8 space-y-4">
            <BrandHeader />
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-emerald-700">Registration Successful!</h2>
                <p className="text-sm text-slate-500 mt-0.5">Your account has been created.</p>
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <p className="text-sm text-emerald-700">
                Redirecting you to the login page in 3 seconds...
              </p>
            </div>
            <button
              onClick={() => {
                window.location.href = HOSPITAL_PORTAL_LOGIN_URL;
              }}
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-2.5 text-sm font-medium text-white hover:from-teal-600 hover:to-emerald-700 transition-all"
            >
              Go to Login
            </button>
          </div>
        </Card>
      </PageWrapper>
    );
  }

  // ---- Registration Form ----
  return (
    <PageWrapper>
      <Card>
        <div className="p-8 space-y-6">
          <BrandHeader />

          {/* Hospital info */}
          {tokenData && (
            <div className="rounded-xl bg-teal-50 border border-teal-200 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-teal-100">
                  <svg className="h-4 w-4 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-teal-900 text-sm">{tokenData.hospitalName}</p>
                  {tokenData.hospitalNameEn && (
                    <p className="text-xs text-teal-700 mt-0.5">{tokenData.hospitalNameEn}</p>
                  )}
                  <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                    </svg>
                    {tokenData.email}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Submit error */}
          {submitError && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}

          <form onSubmit={(e) => { void handleSubmit(e); }} className="space-y-4">
            {/* Username */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="username">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setFieldErrors((p) => ({ ...p, username: '' })); }}
                placeholder="Enter username (min. 3 characters)"
                disabled={submitting}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                  fieldErrors.username
                    ? 'border-red-300 focus:ring-red-100'
                    : 'border-slate-200 focus:border-teal-300 focus:ring-teal-100'
                }`}
              />
              {fieldErrors.username && (
                <p className="text-xs text-red-600">{fieldErrors.username}</p>
              )}
              <p className="text-xs text-slate-400">Letters, numbers, underscores, and hyphens only.</p>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="password">
                Password <span className="text-red-500">*</span>
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })); }}
                placeholder="At least 8 characters"
                disabled={submitting}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                  fieldErrors.password
                    ? 'border-red-300 focus:ring-red-100'
                    : 'border-slate-200 focus:border-teal-300 focus:ring-teal-100'
                }`}
              />
              {fieldErrors.password && (
                <p className="text-xs text-red-600">{fieldErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700" htmlFor="confirmPassword">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((p) => ({ ...p, confirmPassword: '' })); }}
                placeholder="Re-enter your password"
                disabled={submitting}
                className={`w-full rounded-xl border px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
                  fieldErrors.confirmPassword
                    ? 'border-red-300 focus:ring-red-100'
                    : 'border-slate-200 focus:border-teal-300 focus:ring-teal-100'
                }`}
              />
              {fieldErrors.confirmPassword && (
                <p className="text-xs text-red-600">{fieldErrors.confirmPassword}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 py-2.5 text-sm font-medium text-white hover:from-teal-600 hover:to-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Registering...
                </>
              ) : (
                'Complete Registration'
              )}
            </button>
          </form>
        </div>
      </Card>
    </PageWrapper>
  );
}
