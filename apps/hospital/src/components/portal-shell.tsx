'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Video, MessageSquare, Megaphone, LogOut } from 'lucide-react';
import { SidebarNav, type NavItem } from '@medical-crm/ui';
import { useAuth } from '@/lib/auth-context';

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, href: '/dashboard' },
  { key: 'cases', label: 'Cases', icon: <FolderOpen size={20} />, href: '/cases' },
  { key: 'consultations', label: 'Consultations', icon: <Video size={20} />, href: '/consultations' },
  { key: 'messages', label: 'Messages', icon: <MessageSquare size={20} />, href: '/messages' },
  { key: 'materials', label: 'Materials', icon: <Megaphone size={20} />, href: '/materials' },
];

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const activeKey = navItems.find((item) => pathname.startsWith(item.href))?.key ?? 'dashboard';

  return (
    <div className="flex min-h-screen">
      <SidebarNav
        items={navItems}
        activeKey={activeKey}
        onNavigate={(href) => router.push(href)}
        footer={
          <button onClick={logout} className="text-slate-400 hover:text-rose-500" title="Logout">
            <LogOut size={20} />
          </button>
        }
      />
      <main className="ml-[72px] flex-1 p-8">{children}</main>
    </div>
  );
}
