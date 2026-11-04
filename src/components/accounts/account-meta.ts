import { Banknote, CreditCard, Landmark, type LucideIcon } from 'lucide-react';
import type { AccountType } from '@/domain/types';

export const ACCOUNT_TYPE_META: Record<AccountType, { label: string; icon: LucideIcon }> = {
  CASH: { label: 'Espèces', icon: Banknote },
  BANK: { label: 'Banque', icon: Landmark },
  CARD: { label: 'Carte', icon: CreditCard },
};

/** Palette proposée pour les comptes (contraste suffisant avec une icône blanche). */
export const ACCOUNT_COLORS: readonly { value: string; label: string }[] = [
  { value: '#1F5FAD', label: 'Bleu' },
  { value: '#15803D', label: 'Vert' },
  { value: '#0E7490', label: 'Turquoise' },
  { value: '#6D28D9', label: 'Violet' },
  { value: '#BE185D', label: 'Framboise' },
  { value: '#B42318', label: 'Rouge' },
  { value: '#B54708', label: 'Ambre' },
  { value: '#475569', label: 'Ardoise' },
];

export const DEFAULT_ACCOUNT_COLOR = '#1F5FAD';
