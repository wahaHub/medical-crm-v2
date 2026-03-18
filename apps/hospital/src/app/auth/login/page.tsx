'use client';

import { useEffect } from 'react';

const ADMIN_LOGIN_URL =
  process.env.NEXT_PUBLIC_ADMIN_LOGIN_URL ?? 'http://localhost:3002/auth/login';

export default function LoginPage() {
  useEffect(() => {
    window.location.replace(ADMIN_LOGIN_URL);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-emerald-50 to-cyan-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">Medical CRM</h1>
          <p className="text-slate-600 text-sm">Redirecting to unified login...</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-teal-100">
          <p className="text-sm text-slate-700 text-center mb-4">
            Hospital Portal now uses the same login page as Admin Portal.
          </p>
          <a
            href={ADMIN_LOGIN_URL}
            className="block w-full text-center bg-gradient-to-r from-teal-500 to-emerald-600 text-white py-3 rounded-lg font-semibold hover:from-teal-600 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg"
          >
            Go to unified login
          </a>
        </div>
      </div>
    </div>
  );
}
