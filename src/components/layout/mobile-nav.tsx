'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeftRightIcon,
  EllipsisIcon,
  HouseIcon,
  PiggyBankIcon,
  PlusIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { openQuickAdd } from '@/lib/events';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, isActivePath } from './nav-items';

const PRIMARY_HREFS = ['/tableau-de-bord', '/transactions', '/budgets'];

function TabLink({
  href,
  label,
  srSuffix,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  srSuffix?: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[0.6875rem] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="size-5" aria-hidden="true" strokeWidth={active ? 2.3 : 2} />
      <span>
        {label}
        {srSuffix && <span className="sr-only">{srSuffix}</span>}
      </span>
    </Link>
  );
}

/** Barre de navigation mobile (5 entrées) + feuille « Plus ». */
export function MobileNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const others = NAV_ITEMS.filter((i) => !PRIMARY_HREFS.includes(i.href));
  const moreActive = others.some((i) => isActivePath(pathname, i.href));

  return (
    <>
      <nav
        aria-label="Navigation mobile"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-safe backdrop-blur supports-[backdrop-filter]:bg-card/85 md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch gap-1 px-2 py-1">
          <li className="flex flex-1">
            <TabLink
              href="/tableau-de-bord"
              label="Accueil"
              srSuffix=" – Tableau de bord"
              icon={HouseIcon}
              active={isActivePath(pathname, '/tableau-de-bord')}
            />
          </li>
          <li className="flex flex-1">
            <TabLink
              href="/transactions"
              label="Transactions"
              icon={ArrowLeftRightIcon}
              active={isActivePath(pathname, '/transactions')}
            />
          </li>
          <li className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => openQuickAdd()}
              aria-label="Ajouter une transaction"
              className="-mt-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-overlay ring-4 ring-background transition-transform outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring active:scale-95 motion-reduce:transition-none"
            >
              <PlusIcon className="size-6" aria-hidden="true" strokeWidth={2.4} />
            </button>
          </li>
          <li className="flex flex-1">
            <TabLink
              href="/budgets"
              label="Budgets"
              icon={PiggyBankIcon}
              active={isActivePath(pathname, '/budgets')}
            />
          </li>
          <li className="flex flex-1">
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-lg text-[0.6875rem] font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                moreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <EllipsisIcon className="size-5" aria-hidden="true" />
              <span>Plus</span>
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="md:hidden">
          <SheetHeader className="pb-0">
            <SheetTitle>Toutes les rubriques</SheetTitle>
            <SheetDescription>Accédez aux autres pages de Masrouf.</SheetDescription>
          </SheetHeader>
          <nav aria-label="Autres rubriques" className="px-4 pb-6">
            <ul className="grid grid-cols-3 gap-2">
              {others.map((item) => {
                const active = isActivePath(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-2 text-center text-xs font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        active
                          ? 'border-primary/40 bg-brand-tint text-primary'
                          : 'bg-card text-foreground hover:bg-accent',
                      )}
                    >
                      <Icon
                        className={cn('size-5', active ? 'text-primary' : 'text-muted-foreground')}
                        aria-hidden="true"
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
