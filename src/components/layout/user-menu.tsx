'use client';
import Link from 'next/link';
import { useTransition } from 'react';
import { ChevronDownIcon, KeyboardIcon, LogOutIcon, SettingsIcon } from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { openShortcutsHelp } from '@/lib/events';

export interface ShellUser {
  name: string;
  email: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '');
  return letters.join('') || '?';
}

export function UserAvatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-primary ring-1 ring-primary/15"
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-10 gap-2 rounded-full px-1.5 sm:pr-2.5"
          aria-label={`Menu utilisateur (${user.name})`}
        >
          <UserAvatar name={user.name} />
          <span className="hidden max-w-[9rem] truncate text-sm font-medium lg:inline">
            {user.name}
          </span>
          <ChevronDownIcon className="hidden size-4 text-muted-foreground lg:block" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="truncate text-sm font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/parametres">
            <SettingsIcon aria-hidden="true" />
            Paramètres
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => openShortcutsHelp()}>
          <KeyboardIcon aria-hidden="true" />
          Raccourcis clavier
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={pending}
          onSelect={() =>
            startTransition(async () => {
              await logoutAction();
            })
          }
        >
          <LogOutIcon aria-hidden="true" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
