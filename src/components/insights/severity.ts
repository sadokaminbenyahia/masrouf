/**
 * Sévérité → icône + couleur + texte (jamais la couleur seule).
 */
import { CircleCheck, Info, OctagonAlert, TriangleAlert, type LucideIcon } from 'lucide-react';
import type { Severity } from '@/domain/types';

export interface SeverityStyle {
  icon: LucideIcon;
  label: string;
  /** Couleur du texte / de l'icône */
  text: string;
  /** Fond teinté de la pastille */
  tint: string;
}

export const SEVERITY_STYLES: Record<Severity, SeverityStyle> = {
  INFO: { icon: Info, label: 'Information', text: 'text-primary', tint: 'bg-primary/10' },
  SUCCESS: {
    icon: CircleCheck,
    label: 'Bonne nouvelle',
    text: 'text-success',
    tint: 'bg-success/12',
  },
  WARNING: { icon: TriangleAlert, label: 'Attention', text: 'text-warning', tint: 'bg-warning/15' },
  DANGER: { icon: OctagonAlert, label: 'Important', text: 'text-expense', tint: 'bg-expense/12' },
};

const ORDER: Record<Severity, number> = { DANGER: 0, WARNING: 1, INFO: 2, SUCCESS: 3 };

/** Trie du plus grave au moins grave (tri stable). */
export function bySeverity<T extends { severity: Severity }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
