'use client';

import { usePathname, useRouter } from 'next/navigation';
import { SidebarNav, type NavItem } from '@medical-crm/ui';
import { LayoutDashboard, FolderOpen, Building2, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Dashboard', href: '/' },
  { key: 'cases', icon: <FolderOpen className="h-5 w-5" />, label: 'Cases', href: '/cases' },
  { key: 'hospitals', icon: <Building2 className="h-5 w-5" />, label: 'Hospitals', href: '/hospitals' },
];

function getActiveKey(pathname: string): string {
  if (pathname.startsWith('/cases')) return 'cases';
  if (pathname.startsWith('/hospitals')) return 'hospitals';
  return 'dashboard';
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen">
      <SidebarNav
        items={NAV_ITEMS}
        activeKey={getActiveKey(pathname)}
        onNavigate={(href) => router.push(href)}
      />
      <div className="ml-[72px] flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b bg-white px-6">
          <h1 className="text-sm font-semibold text-gray-600">Admin Portal</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">{user.email}</span>
            <button
              onClick={logout}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
