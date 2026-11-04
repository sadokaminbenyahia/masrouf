/**
 * Noms d'icônes autorisés (stockés en base pour les catégories et les objectifs). Liste
 * exhaustive : le registre `src/components/shared/category-icon.tsx` fournit une icône lucide
 * pour CHAQUE nom (vérifié par test). Toute autre valeur est refusée par `iconSchema`.
 */
export const ICON_NAMES = [
  'ShoppingCart',
  'UtensilsCrossed',
  'Coffee',
  'Bus',
  'Fuel',
  'House',
  'Home',
  'Zap',
  'Smartphone',
  'HeartPulse',
  'ShoppingBag',
  'Clapperboard',
  'Repeat',
  'GraduationCap',
  'Gift',
  'PiggyBank',
  'Tag',
  'Banknote',
  'Briefcase',
  'Coins',
  'Wallet',
  'Landmark',
  'CreditCard',
  'Target',
  'Plane',
  'Car',
  'Baby',
  'Dumbbell',
  'Music',
  'Book',
  'Gamepad2',
  'TrainFront',
  'Bike',
  'Wifi',
  'Droplets',
  'Pill',
  'Stethoscope',
  'Shirt',
  'Scissors',
  'Pizza',
  'Cake',
  'Tv',
  'Ticket',
  'Camera',
  'Palette',
  'Gem',
  'PawPrint',
  'Dog',
  'Users',
  'Building2',
  'Wrench',
  'Receipt',
  'HandCoins',
  'TrendingUp',
  'Laptop',
  'Sparkles',
  'ShieldCheck',
  'CircleDashed',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const ICON_SET: ReadonlySet<string> = new Set(ICON_NAMES);

/** Vrai si `name` est un nom d'icône autorisé (aucune propriété héritée n'est acceptée). */
export function isIconName(name: string): name is IconName {
  return ICON_SET.has(name);
}
