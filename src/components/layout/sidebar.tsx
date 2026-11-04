'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BrandMark } from './brand';
import { NAV_ITEMS, NAV_SECTIONS, isActivePath } from './nav-items';

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname = usePathname();
  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        'sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ease-out md:flex',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <div className={cn('flex h-16 items-center', collapsed ? 'justify-center px-2' : 'px-5')}>
        <Link
          href="/tableau-de-bord"
          className="rounded-lg"
          aria-label="Masrouf, tableau de bord"
        >
          <BrandMark compact={collapsed} />
        </Link>
      </div>

      <nav aria-label="Navigation principale" className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => {
          const items = NAV_ITEMS.filter((i) => i.section === section.id);
          return (
            <div key={section.id} className="mt-4 first:mt-1">
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden="true" />
              ) : (
                <p className="mb-1.5 px-3 text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {section.label}
                </p>
              )}
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const active = isActivePath(pathname, item.href);
                  const Icon = item.icon;
                  const link = (
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                        collapsed && 'justify-center px-0',
                        active
                          ? 'bg-card text-primary shadow-card ring-1 ring-border'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      {active && (
                        <span
                          aria-hidden="true"
                          className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-primary"
                        />
                      )}
                      <Icon
                        className={cn(
                          'size-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105 motion-reduce:transition-none',
                          active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                        )}
                        aria-hidden="true"
                      />
                      <span className={cn(collapsed && 'sr-only')}>{item.label}</span>
                    </Link>
                  );
                  return (
                    <li key={item.href}>
                      {collapsed ? (
                        <Tooltip>
                          <TooltipTrigger asChild>{link}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      ) : (
                        link
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className={cn('border-t p-3', collapsed && 'flex justify-center')}>
        <Button
          type="button"
          variant="ghost"
          size={collapsed ? 'icon' : 'default'}
          className={cn('text-muted-foreground', !collapsed && 'w-full justify-start')}
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? (
            <PanelLeftOpenIcon aria-hidden="true" />
          ) : (
            <>
              <PanelLeftCloseIcon aria-hidden="true" />
              <span>Replier le menu</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
