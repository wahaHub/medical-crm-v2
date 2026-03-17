// apps/admin/src/lib/auth-context.tsx
'use client';
import { createContext, useContext, useCallback, type ReactNode } from 'react';

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
}

interface AuthContextValue {
  user: AdminUser;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ user, children }: { user: AdminUser; children: ReactNode }) {
  const logout = useCallback(async () => {
    window.location.href = '/auth/logout';
  }, []);
  return <AuthContext.Provider value={{ user, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
