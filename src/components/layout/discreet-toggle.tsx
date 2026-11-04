'use client';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';

export function DiscreetToggle() {
  const { discreet, toggle } = useDiscreetMode();
  const label = discreet ? 'Afficher les montants' : 'Masquer les montants';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          onClick={toggle}
          className={cn(
            'size-11 md:size-10',
            discreet && 'bg-primary/10 text-primary hover:bg-primary/15',
          )}
        >
          {discreet ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
