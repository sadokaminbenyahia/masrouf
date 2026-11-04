'use client';
import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Bascule clair ↔ sombre (à partir du thème effectif, y compris « système »). */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const next = resolvedTheme === 'dark' ? 'light' : 'dark';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Changer de thème"
          className="size-11 md:size-10"
          onClick={() => setTheme(next)}
        >
          <SunIcon className="hidden dark:block" aria-hidden="true" />
          <MoonIcon className="block dark:hidden" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Changer de thème</TooltipContent>
    </Tooltip>
  );
}
