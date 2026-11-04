'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { openQuickAdd } from '@/lib/events';
import { CommandPalette } from '@/components/command-palette/command-palette';
import { QuickAddTransaction } from '@/components/transactions/quick-add';
import { MobileNav } from './mobile-nav';
import { NavHotkeys } from './nav-hotkeys';
import { ShortcutsDialog } from './shortcuts-dialog';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import type { ShellUser } from './user-menu';

export const SIDEBAR_COOKIE = 'masrouf-sidebar';

export function AppShell({
  user,
  defaultCollapsed,
  children,
}: {
  user: ShellUser;
  defaultCollapsed: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // Raccourci PWA « Ajouter une dépense » (?nouveau=1) : ouvre l'ajout rapide une fois monté.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('nouveau') !== '1') return;
    url.searchParams.delete('nouveau');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
    openQuickAdd({ prefill: { type: 'EXPENSE' } });
  }, []);

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
  };

  return (
    <>
      <a
        href="#contenu"
        className="bg-primary text-primary-foreground shadow-overlay focus-visible:ring-ring/50 fixed top-3 left-3 z-[100] -translate-y-20 rounded-lg px-4 py-2.5 text-sm font-medium transition-transform focus-visible:translate-y-0 focus-visible:ring-[3px] focus-visible:outline-none"
      >
        Aller au contenu
      </a>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />
          <main
            id="contenu"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-28 outline-none sm:px-6 md:pb-12 lg:px-8"
          >
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
      <NavHotkeys />
      <ShortcutsDialog />
      <QuickAddTransaction />
      <CommandPalette />
    </>
  );
}
