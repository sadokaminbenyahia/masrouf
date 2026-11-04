'use client';
import Link from 'next/link';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { openCommandPalette, openQuickAdd } from '@/lib/events';
import { BrandMark } from './brand';
import { DiscreetToggle } from './discreet-toggle';
import { Kbd } from './kbd';
import { ThemeToggle } from './theme-toggle';
import { UserMenu, type ShellUser } from './user-menu';
import { useIsApplePlatform } from './use-platform';

export function Topbar({ user }: { user: ShellUser }) {
  const isApple = useIsApplePlatform();
  const mod = isApple ? '⌘' : 'Ctrl';
  return (
    <header className="bg-background/85 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          href="/tableau-de-bord"
          className="rounded-lg md:hidden"
          aria-label="Masrouf, tableau de bord"
        >
          <BrandMark compact />
        </Link>

        <button
          type="button"
          onClick={() => openCommandPalette()}
          className="group border-border bg-card text-muted-foreground hover:border-input hover:text-foreground focus-visible:ring-ring/50 hidden h-10 w-full max-w-sm items-center gap-2.5 rounded-lg border px-3 text-sm shadow-xs transition-colors outline-none focus-visible:ring-[3px] md:flex"
        >
          <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 text-left">Rechercher…</span>
          <span className="flex items-center gap-1">
            <Kbd>{mod}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => openCommandPalette()}
            aria-label="Rechercher"
          >
            <SearchIcon aria-hidden="true" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                className="hidden md:inline-flex"
                onClick={() => openQuickAdd()}
                aria-keyshortcuts="N"
              >
                <PlusIcon aria-hidden="true" />
                Ajouter
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Ajouter une transaction{' '}
              <Kbd className="border-background/30 bg-background/15 text-background ml-1">N</Kbd>
            </TooltipContent>
          </Tooltip>
          <DiscreetToggle />
          <ThemeToggle />
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}
