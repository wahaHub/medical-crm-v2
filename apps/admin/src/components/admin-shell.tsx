'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { LoadingSpinner, SidebarNav, type NavItem, useOptimisticNavigationState } from '@medical-crm/ui';
import { LayoutDashboard, FolderOpen, Building2, LogOut, MessageSquare, ShoppingCart, Package, Ticket, ClipboardList, HelpCircle, Settings as SettingsIcon, Video, BookOpen } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', icon: <LayoutDashboard className="h-5 w-5" />, label: 'Dashboard', href: '/' },
  { key: 'cases', icon: <FolderOpen className="h-5 w-5" />, label: 'Cases', href: '/cases' },
  { key: 'video-consultations', icon: <Video className="h-5 w-5" />, label: 'Video', href: '/video-consultations' },
  { key: 'guides', icon: <BookOpen className="h-5 w-5" />, label: 'Guides', href: '/guides' },
  { key: 'hospitals', icon: <Building2 className="h-5 w-5" />, label: 'Hospitals', href: '/hospitals' },
  { key: 'messages', icon: <MessageSquare className="h-5 w-5" />, label: 'Messages', href: '/messages' },
  { key: 'orders', icon: <ShoppingCart className="h-5 w-5" />, label: 'Orders', href: '/orders' },
  { key: 'packages', icon: <Package className="h-5 w-5" />, label: 'Packages', href: '/packages' },
  { key: 'support', icon: <Ticket className="h-5 w-5" />, label: 'Support', href: '/support' },
  { key: 'question-collectors', icon: <ClipboardList className="h-5 w-5" />, label: 'Q&A Templates', href: '/question-collectors' },
  { key: 'chatbot', icon: <HelpCircle className="h-5 w-5" />, label: 'Chatbot & FAQ', href: '/chatbot' },
  { key: 'settings', icon: <SettingsIcon className="h-5 w-5" />, label: 'Settings', href: '/settings' },
];

function getActiveKey(pathname: string): string {
  if (pathname.startsWith('/cases')) return 'cases';
  if (pathname.startsWith('/lifecycle')) return 'cases'; // legacy redirect target
  if (pathname.startsWith('/video-consultations')) return 'video-consultations';
  if (pathname.startsWith('/guides')) return 'guides';
  if (pathname.startsWith('/hospitals')) return 'hospitals';
  if (pathname.startsWith('/messages')) return 'messages';
  if (pathname.startsWith('/orders')) return 'orders';
  if (pathname.startsWith('/packages')) return 'packages';
  if (pathname.startsWith('/support')) return 'support';
  if (pathname.startsWith('/question-collectors')) return 'question-collectors';
  if (pathname.startsWith('/chatbot')) return 'chatbot';
  if (pathname.startsWith('/settings')) return 'settings';
  return 'dashboard';
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isRoutePending, startRouteTransition] = useTransition();
  const { user, logout } = useAuth();
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const committedActiveKey = getActiveKey(pathname);
  const {
    displayActiveKey,
    pendingKey,
    isNavigating,
    navigateTo,
  } = useOptimisticNavigationState(committedActiveKey, isRoutePending);

  useEffect(() => {
    const pingPresence = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      void fetch('/api/users/me', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      }).catch(() => {});
    };

    pingPresence();
    const intervalId = window.setInterval(pingPresence, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        pingPresence();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', pingPresence);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', pingPresence);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F8F9FB]">
      <SidebarNav
        items={NAV_ITEMS}
        activeKey={displayActiveKey}
        committedKey={committedActiveKey}
        pendingKey={pendingKey}
        pendingLabel="Loading section"
        onNavigate={(item) => navigateTo(item.key, () => startRouteTransition(() => router.push(item.href)))}
      />
      <div className="ml-[72px] flex flex-1 flex-col">
        <header className="fixed left-[72px] right-0 top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/50 bg-white/75 px-8 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="h-12 w-44 rounded-xl bg-white/80 px-2 shadow-md flex items-center">
              {logoLoadFailed ? (
                <span className="w-full text-center text-lg font-semibold tracking-[0.18em] text-slate-700">
                  MEDORA
                </span>
              ) : (
                <img
                  src="/medora_logo.png"
                  alt="Medora"
                  className="h-10 w-full object-contain"
                  onError={() => setLogoLoadFailed(true)}
                />
              )}
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <h1 className="text-lg font-semibold tracking-tight text-slate-700">Admin Portal</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{user.email}</span>
            <button
              onClick={() => void logout()}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-rose-600"
            >
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </header>
        <main aria-busy={isNavigating} className="relative flex-1 p-8 pt-24">
          {children}
          {isNavigating && (
            <div className="absolute inset-0 z-20 flex cursor-progress items-center justify-center bg-[#F8F9FB]/72 backdrop-blur-[1px]" role="status" aria-live="polite" aria-label="Loading section">
              <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/92 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                <LoadingSpinner size="sm" />
                <span>Loading...</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
