'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, FolderOpen, Video, MessageSquare, Megaphone, LogOut, Search, Bell, Mail, HelpCircle, Settings as SettingsIcon } from 'lucide-react';
import { SidebarNav, type NavItem } from '@medical-crm/ui';
import { useAuth } from '@/lib/auth-context';
import { useHospitalI18n } from '@/lib/hospital-i18n';

export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { t } = useHospitalI18n();

  const navItems: NavItem[] = [
    {
      key: 'dashboard',
      label: t('hospital.portalShell.nav.dashboard', undefined, 'Dashboard'),
      icon: <LayoutDashboard size={20} />,
      href: '/dashboard',
    },
    {
      key: 'cases',
      label: t('hospital.portalShell.nav.cases', undefined, 'Cases'),
      icon: <FolderOpen size={20} />,
      href: '/cases',
    },
    {
      key: 'consultations',
      label: t('hospital.portalShell.nav.consultations', undefined, 'Consultations'),
      icon: <Video size={20} />,
      href: '/consultations',
    },
    {
      key: 'messages',
      label: t('hospital.portalShell.nav.messages', undefined, 'Messages'),
      icon: <MessageSquare size={20} />,
      href: '/messages',
    },
    {
      key: 'materials',
      label: t('hospital.portalShell.nav.materials', undefined, 'Materials'),
      icon: <Megaphone size={20} />,
      href: '/materials',
    },
    {
      key: 'email-templates',
      label: t('hospital.portalShell.nav.emailTemplates', undefined, 'Email Templates'),
      icon: <Mail size={20} />,
      href: '/email-templates',
    },
    {
      key: 'faq',
      label: t('hospital.portalShell.nav.faq', undefined, 'Chatbot & FAQ'),
      icon: <HelpCircle size={20} />,
      href: '/faq',
    },
    {
      key: 'settings',
      label: t('hospital.portalShell.nav.settings', undefined, 'Settings'),
      icon: <SettingsIcon size={20} />,
      href: '/settings',
    },
  ];
  const logoutLabel = t('hospital.portalShell.actions.logout', undefined, 'Logout');
  const portalTitle = t('hospital.portalShell.title', undefined, 'Hospital Portal');
  const searchPlaceholder = t(
    'hospital.portalShell.search.placeholder',
    undefined,
    'Search patients, cases...'
  );
  const notificationsLabel = t(
    'hospital.portalShell.actions.notifications',
    undefined,
    'Notifications'
  );

  const isFullscreen = pathname.includes('/room');
  const activeKey = navItems.find((item) => pathname.startsWith(item.href))?.key ?? 'dashboard';

  if (isFullscreen) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex min-h-screen bg-[#F8F9FB]">
      <SidebarNav
        items={navItems}
        activeKey={activeKey}
        onNavigate={(href) => router.push(href)}
        footer={
          <div className="relative group flex items-center">
            <button
              onClick={logout}
              aria-label={logoutLabel}
              title={logoutLabel}
              className="p-3 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all duration-200"
            >
              <LogOut size={20} strokeWidth={1.5} />
            </button>
            <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg">
              {logoutLabel}
            </div>
          </div>
        }
      />
      <div className="ml-[72px] flex flex-1 flex-col">
        {/* Header */}
        <header className="fixed left-[72px] right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/50 bg-white/75 px-8 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="h-12 w-44 rounded-xl shadow-md bg-white/80 px-2 flex items-center">
              <img
                src="/medora_logo.png"
                alt="Medora"
                className="h-10 w-full object-contain"
              />
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-700">{portalTitle}</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                aria-label={searchPlaceholder}
                placeholder={searchPlaceholder}
                className="w-72 rounded-full border border-slate-200/80 bg-white py-2 pl-10 pr-4 text-sm shadow-sm shadow-slate-100/50 transition-all placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <button
              aria-label={notificationsLabel}
              title={notificationsLabel}
              className="relative p-2 text-slate-400 transition-colors hover:text-slate-600"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full border-2 border-white bg-rose-500" />
            </button>
          </div>
        </header>
        {/* Main content */}
        <main className="flex-1 p-8 pt-24">{children}</main>
      </div>
    </div>
  );
}
