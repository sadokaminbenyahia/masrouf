import {
  ArrowLeftRightIcon,
  ChartLineIcon,
  LayoutDashboardIcon,
  PiggyBankIcon,
  RepeatIcon,
  SettingsIcon,
  SparklesIcon,
  TargetIcon,
  UploadIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Lettre du raccourci « g puis … » */
  shortcut: string;
  section: 'main' | 'plan' | 'insight' | 'system';
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: '/tableau-de-bord',
    label: 'Tableau de bord',
    icon: LayoutDashboardIcon,
    shortcut: 'd',
    section: 'main',
  },
  {
    href: '/transactions',
    label: 'Transactions',
    icon: ArrowLeftRightIcon,
    shortcut: 't',
    section: 'main',
  },
  { href: '/comptes', label: 'Comptes', icon: WalletIcon, shortcut: 'c', section: 'main' },
  { href: '/budgets', label: 'Budgets', icon: PiggyBankIcon, shortcut: 'b', section: 'plan' },
  { href: '/objectifs', label: 'Objectifs', icon: TargetIcon, shortcut: 'o', section: 'plan' },
  { href: '/recurrents', label: 'Récurrents', icon: RepeatIcon, shortcut: 'r', section: 'plan' },
  { href: '/import', label: 'Import', icon: UploadIcon, shortcut: 'i', section: 'plan' },
  { href: '/analyses', label: 'Analyses', icon: ChartLineIcon, shortcut: 'a', section: 'insight' },
  { href: '/assistant', label: 'Assistant', icon: SparklesIcon, shortcut: 'q', section: 'insight' },
  {
    href: '/parametres',
    label: 'Paramètres',
    icon: SettingsIcon,
    shortcut: 'p',
    section: 'system',
  },
];

export const NAV_SECTIONS: { id: NavItem['section']; label: string }[] = [
  { id: 'main', label: 'Au quotidien' },
  { id: 'plan', label: 'Planifier' },
  { id: 'insight', label: 'Comprendre' },
  { id: 'system', label: 'Compte' },
];

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
