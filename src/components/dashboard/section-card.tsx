/**
 * Carte de section du tableau de bord / des analyses : titre <h2>, description, action.
 * Compatible Server Components.
 */
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SectionCardProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  /** Identifiant DOM (ancre) ; sert aussi à relier le titre à la région */
  id?: string;
  testId?: string;
  className?: string;
  contentClassName?: string;
}

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  action,
  children,
  id,
  testId,
  className,
  contentClassName,
}: SectionCardProps) {
  const headingId = `${id ?? testId ?? slug(title)}-titre`;
  return (
    <Card
      id={id}
      data-testid={testId}
      role="region"
      aria-labelledby={headingId}
      className={cn('min-w-0 scroll-mt-24', className)}
    >
      <CardHeader>
        {/* Titre et action sur une même ligne, centrés verticalement : la marge négative absorbe
            la hauteur des cibles tactiles de 44 px sans décaler le titre ni agrandir l'en-tête. */}
        <div className="flex min-w-0 items-center justify-between gap-3">
          <h2
            id={headingId}
            className="flex min-w-0 items-center gap-2 text-base leading-tight font-semibold"
          >
            {Icon ? <Icon aria-hidden className="text-muted-foreground size-4 shrink-0" /> : null}
            {title}
          </h2>
          {action ? (
            <div data-slot="section-action" className="-my-3 flex shrink-0 items-center">
              {action}
            </div>
          ) : null}
        </div>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn('min-w-0', contentClassName)}>{children}</CardContent>
    </Card>
  );
}
