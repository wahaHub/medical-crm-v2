// apps/hospital/src/lib/auth-context.tsx
'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
  hospitalId: string | null;
  preferredLanguage?: string;
}

interface AuthContextValue {
  user: AuthUser;
  logout: () => void;
  updatePreferredLanguage: (preferredLanguage: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  user,
  children,
}: {
  user: AuthUser;
  children: ReactNode;
}) {
  const [currentUser, setCurrentUser] = useState(user);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/auth/login';
  };

  const updatePreferredLanguage = (preferredLanguage: string) => {
    setCurrentUser((prev) => ({ ...prev, preferredLanguage }));
  };

  return (
    <AuthContext.Provider value={{ user: currentUser, logout, updatePreferredLanguage }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
