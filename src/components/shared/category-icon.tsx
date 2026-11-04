import {
  Baby,
  Banknote,
  Bike,
  Book,
  Briefcase,
  Building2,
  Bus,
  Cake,
  Camera,
  Car,
  CircleDashed,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Dog,
  Droplets,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  GraduationCap,
  HandCoins,
  HeartPulse,
  Home,
  House,
  Landmark,
  Laptop,
  Music,
  Palette,
  PawPrint,
  Pill,
  PiggyBank,
  Pizza,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Stethoscope,
  Tag,
  Target,
  Ticket,
  TrainFront,
  TrendingUp,
  Tv,
  Users,
  UtensilsCrossed,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { createElement, type ComponentProps } from 'react';
import { ICON_NAMES, isIconName, type IconName } from '@/domain/icons';
import type { Category } from '@/domain/types';
import { cn } from '@/lib/utils';

/** Registre fixe : nom (stocké en base) → composant lucide. */
const ICONS = {
  ShoppingCart,
  UtensilsCrossed,
  Coffee,
  Bus,
  Fuel,
  House,
  Home,
  Zap,
  Smartphone,
  HeartPulse,
  ShoppingBag,
  Clapperboard,
  Repeat,
  GraduationCap,
  Gift,
  PiggyBank,
  Tag,
  Banknote,
  Briefcase,
  Coins,
  Wallet,
  Landmark,
  CreditCard,
  Target,
  Plane,
  Car,
  Baby,
  Dumbbell,
  Music,
  Book,
  Gamepad2,
  TrainFront,
  Bike,
  Wifi,
  Droplets,
  Pill,
  Stethoscope,
  Shirt,
  Scissors,
  Pizza,
  Cake,
  Tv,
  Ticket,
  Camera,
  Palette,
  Gem,
  PawPrint,
  Dog,
  Users,
  Building2,
  Wrench,
  Receipt,
  HandCoins,
  TrendingUp,
  Laptop,
  Sparkles,
  ShieldCheck,
  CircleDashed,
} satisfies Record<IconName, LucideIcon>;

export type CategoryIconName = IconName;

/**
 * Noms proposés dans les sélecteurs d'icône (« Home » est un alias de « House » ;
 * « CircleDashed » est réservé à « Sans catégorie »).
 */
export const CATEGORY_ICON_NAMES: string[] = ICON_NAMES.filter(
  (n) => n !== 'Home' && n !== 'CircleDashed',
);

export function getCategoryIcon(name: string): LucideIcon {
  // Object.hasOwn + liste fermée : « constructor », « __proto__ »… ne sont jamais des icônes.
  return Object.hasOwn(ICONS, name) && isIconName(name) ? ICONS[name] : Tag;
}

/** Registre exposé pour les tests (toutes les entrées de ICON_NAMES ont une icône). */
export const ICON_REGISTRY: Readonly<Record<IconName, LucideIcon>> = ICONS;

/** Icône lucide par nom (repli : Tag). */
export function IconByName({ name, ...props }: { name: string } & ComponentProps<LucideIcon>) {
  return createElement(getCategoryIcon(name), props);
}

const SIZES = {
  sm: { box: 'size-7 rounded-lg', icon: 'size-3.5' },
  md: { box: 'size-9 rounded-xl', icon: 'size-[18px]' },
  lg: { box: 'size-12 rounded-2xl', icon: 'size-6' },
} as const;

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export interface CategoryIconProps {
  icon: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Pastille colorée (fond teinté 14 %, icône dans la couleur de la catégorie). Décorative. */
export function CategoryIcon({ icon, color, size = 'md', className }: CategoryIconProps) {
  const safe = HEX_RE.test(color) ? color : '#64748B';
  const s = SIZES[size];
  return (
    <span
      data-slot="category-icon"
      aria-hidden="true"
      className={cn('inline-flex shrink-0 items-center justify-center', s.box, className)}
      style={{
        backgroundColor: `color-mix(in oklab, ${safe} 14%, transparent)`,
        color: `color-mix(in oklab, ${safe} var(--category-ink), var(--foreground))`,
      }}
    >
      <IconByName name={icon} className={s.icon} strokeWidth={2.1} />
    </span>
  );
}

export interface CategoryBadgeProps {
  category: Pick<Category, 'name' | 'icon' | 'color'> | null;
  className?: string;
}

/** Icône + nom ; « Sans catégorie » si null. */
export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  if (!category) {
    return (
      <span
        data-slot="category-badge"
        className={cn(
          'text-muted-foreground inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed px-2 py-0.5 text-xs font-medium',
          className,
        )}
      >
        <Tag className="size-3" aria-hidden="true" />
        Sans catégorie
      </span>
    );
  }
  const safe = HEX_RE.test(category.color) ? category.color : '#64748B';
  return (
    <span
      data-slot="category-badge"
      className={cn(
        'text-foreground inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${safe} 13%, transparent)` }}
    >
      <IconByName
        name={category.icon}
        className="size-3 shrink-0"
        aria-hidden="true"
        style={{ color: `color-mix(in oklab, ${safe} var(--category-ink), var(--foreground))` }}
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
