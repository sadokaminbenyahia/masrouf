/**
 * Catégories par défaut (création de compte et données de démo). Noms EXACTS : ils servent
 * aussi de clés aux règles de mots-clés de l'IA (CATEGORY_KEYWORDS).
 * Couleurs : contraste ≥ 3:1 sur les fonds clair (#FFFFFF) et sombre (#0F1216).
 */
import type { CategoryGroup, CategoryKind } from './types';

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
  group: CategoryGroup;
  icon: string;
  color: string;
  sortOrder: number;
}

type Def = Omit<DefaultCategory, 'kind' | 'sortOrder'>;

const EXPENSES: readonly Def[] = [
  { name: 'Courses', group: 'NEEDS', icon: 'ShoppingCart', color: '#1E9E5A' },
  { name: 'Restaurants', group: 'WANTS', icon: 'UtensilsCrossed', color: '#E0661A' },
  { name: 'Cafés', group: 'WANTS', icon: 'Coffee', color: '#B07A1E' },
  { name: 'Transport', group: 'NEEDS', icon: 'Bus', color: '#2F72D6' },
  { name: 'Carburant', group: 'NEEDS', icon: 'Fuel', color: '#7C8794' },
  { name: 'Loyer', group: 'NEEDS', icon: 'House', color: '#7A6FD8' },
  { name: 'Factures', group: 'NEEDS', icon: 'Zap', color: '#B8860B' },
  { name: 'Télécom', group: 'NEEDS', icon: 'Smartphone', color: '#0E9AA7' },
  { name: 'Santé', group: 'NEEDS', icon: 'HeartPulse', color: '#D2463F' },
  { name: 'Shopping', group: 'WANTS', icon: 'ShoppingBag', color: '#E05297' },
  { name: 'Loisirs', group: 'WANTS', icon: 'Clapperboard', color: '#B356C9' },
  { name: 'Abonnements', group: 'WANTS', icon: 'Repeat', color: '#6A7FDB' },
  { name: 'Éducation', group: 'NEEDS', icon: 'GraduationCap', color: '#2B8FC4' },
  { name: 'Famille & cadeaux', group: 'WANTS', icon: 'Gift', color: '#DB6B4F' },
  { name: 'Épargne', group: 'SAVINGS', icon: 'PiggyBank', color: '#3A9E8C' },
  { name: 'Divers', group: 'WANTS', icon: 'Tag', color: '#8A8F98' },
];

const INCOMES: readonly Def[] = [
  { name: 'Salaire', group: 'INCOME', icon: 'Banknote', color: '#2E9A4E' },
  { name: 'Freelance', group: 'INCOME', icon: 'Briefcase', color: '#C2467A' },
  { name: 'Autres revenus', group: 'INCOME', icon: 'Coins', color: '#A87A10' },
];

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  ...EXPENSES.map((c, i) => ({ ...c, kind: 'EXPENSE' as const, sortOrder: i })),
  ...INCOMES.map((c, i) => ({ ...c, kind: 'INCOME' as const, sortOrder: EXPENSES.length + i })),
];

export const DEFAULT_ACCOUNTS = [
  { name: 'Espèces', type: 'CASH', color: '#15803D', initialBalance: 0, sortOrder: 0 },
  { name: 'Banque', type: 'BANK', color: '#1F5FAD', initialBalance: 0, sortOrder: 1 },
] as const;
