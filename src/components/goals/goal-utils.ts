/**
 * Fonctions pures de la page Objectifs : statuts, textes accessibles, versement optimiste,
 * validation des versements/retraits, valeurs de recréation (« Annuler » une suppression).
 */
import { formatMoney, type Millimes } from '@/domain/money';
import type { Goal, GoalProgress } from '@/domain/types';
import type { GoalInput } from '@/lib/schemas/budgets';

export type GoalStatus = GoalProgress['status'];
export type StatusVariant = 'success' | 'income' | 'warning' | 'secondary' | 'expense';

export const GOAL_STATUS_META: Record<GoalStatus, { label: string; variant: StatusVariant }> = {
  COMPLETED: { label: 'Atteint', variant: 'success' },
  ON_TRACK: { label: 'En bonne voie', variant: 'income' },
  AT_RISK: { label: 'En retard', variant: 'warning' },
  NO_DEADLINE: { label: 'Sans échéance', variant: 'secondary' },
  OVERDUE: { label: 'Échéance dépassée', variant: 'expense' },
};

/** Palette proposée pour les objectifs (contrastée en clair et en sombre). */
export const GOAL_COLORS: readonly { value: string; label: string }[] = [
  { value: '#15803D', label: 'Vert' },
  { value: '#1F5FAD', label: 'Bleu' },
  { value: '#0E7490', label: 'Turquoise' },
  { value: '#7C3AED', label: 'Violet' },
  { value: '#BE185D', label: 'Framboise' },
  { value: '#B42318', label: 'Rouge' },
  { value: '#B54708', label: 'Orange' },
  { value: '#4D7C0F', label: 'Olive' },
  { value: '#64748B', label: 'Ardoise' },
];

/** Libellés français des icônes (lecteurs d'écran) ; repli sur le nom technique. */
const ICON_LABELS: Record<string, string> = {
  ShoppingCart: 'Caddie',
  UtensilsCrossed: 'Couverts',
  Coffee: 'Café',
  Bus: 'Bus',
  Fuel: 'Carburant',
  House: 'Maison',
  Zap: 'Éclair',
  Smartphone: 'Téléphone',
  HeartPulse: 'Santé',
  ShoppingBag: 'Sac de courses',
  Clapperboard: 'Cinéma',
  Repeat: 'Répétition',
  GraduationCap: 'Études',
  Gift: 'Cadeau',
  PiggyBank: 'Tirelire',
  Tag: 'Étiquette',
  Banknote: 'Billet',
  Briefcase: 'Mallette',
  Coins: 'Pièces',
  Wallet: 'Portefeuille',
  Landmark: 'Banque',
  CreditCard: 'Carte bancaire',
  Target: 'Cible',
  Plane: 'Avion',
  Car: 'Voiture',
  Baby: 'Bébé',
  Dumbbell: 'Sport',
  Music: 'Musique',
  Book: 'Livre',
  Gamepad2: 'Jeux vidéo',
  TrainFront: 'Train',
  Bike: 'Vélo',
  Wifi: 'Internet',
  Droplets: 'Eau',
  Pill: 'Médicament',
  Stethoscope: 'Médecin',
  Shirt: 'Vêtements',
  Scissors: 'Coiffeur',
  Pizza: 'Pizza',
  Cake: 'Gâteau',
  Tv: 'Télévision',
  Ticket: 'Billet de spectacle',
  Camera: 'Appareil photo',
  Palette: 'Art',
  Gem: 'Bijou',
  PawPrint: 'Animal',
  Dog: 'Chien',
  Users: 'Famille',
  Building2: 'Immeuble',
  Wrench: 'Travaux',
  Receipt: 'Facture',
  HandCoins: 'Don',
  TrendingUp: 'Investissement',
  Laptop: 'Ordinateur',
  Sparkles: 'Étincelles',
};

export function iconLabel(name: string): string {
  return ICON_LABELS[name] ?? name;
}

/** Pourcentage atteint (0..100, arrondi). */
export function goalPercent(goal: Pick<Goal, 'savedAmount' | 'targetAmount'>): number {
  if (goal.targetAmount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((goal.savedAmount / goal.targetAmount) * 100)));
}

/** aria-valuetext : « 600 DT sur 1 500 DT ». */
export function goalValueText(
  goal: Pick<Goal, 'savedAmount' | 'targetAmount'>,
  discreet = false,
): string {
  const pct = goalPercent(goal);
  if (discreet) return `${pct} % de la cible`;
  const f = (m: Millimes) => formatMoney(m, { decimals: 0 });
  return `${f(goal.savedAmount)} sur ${f(goal.targetAmount)}`;
}

/** Recalcule un objectif après un versement (>0) ou un retrait (<0) — affichage optimiste. */
export function applyContribution(goal: GoalProgress, delta: Millimes): GoalProgress {
  const savedAmount = Math.max(0, goal.savedAmount + delta);
  const remaining = Math.max(0, goal.targetAmount - savedAmount);
  const ratio = goal.targetAmount > 0 ? savedAmount / goal.targetAmount : 0;
  const completed = savedAmount >= goal.targetAmount;
  let status: GoalStatus = goal.status;
  if (completed) status = 'COMPLETED';
  else if (goal.status === 'COMPLETED')
    status = goal.targetDate === null ? 'NO_DEADLINE' : 'ON_TRACK';
  const monthlyNeeded = completed
    ? null
    : goal.monthsLeft !== null && goal.monthsLeft > 0
      ? Math.ceil(remaining / goal.monthsLeft)
      : goal.monthlyNeeded;
  return {
    ...goal,
    savedAmount,
    remaining,
    ratio,
    status,
    monthlyNeeded,
    completedAt: completed ? goal.completedAt : null,
  };
}

/** Le versement vient de faire passer l'objectif à « Atteint ». */
export function becameCompleted(
  before: Pick<Goal, 'savedAmount' | 'targetAmount'>,
  after: GoalProgress,
) {
  return before.savedAmount < before.targetAmount && after.status === 'COMPLETED';
}

export type ContributionMode = 'deposit' | 'withdraw';

/** Montant signé envoyé à l'action, ou message d'erreur. */
export function contributionDelta(
  mode: ContributionMode,
  amount: Millimes,
  goal: Pick<Goal, 'savedAmount'>,
): { ok: true; delta: Millimes } | { ok: false; error: string } {
  if (amount <= 0) return { ok: false, error: 'Le montant doit être supérieur à zéro.' };
  if (mode === 'withdraw') {
    if (goal.savedAmount <= 0)
      return { ok: false, error: 'Rien à retirer : aucun montant épargné.' };
    if (amount > goal.savedAmount) {
      return {
        ok: false,
        error: `Vous ne pouvez pas retirer plus que le montant épargné (${formatMoney(goal.savedAmount)}).`,
      };
    }
    return { ok: true, delta: -amount };
  }
  return { ok: true, delta: amount };
}

/** Valeurs pour recréer un objectif supprimé (« Annuler »). */
export function goalToInput(goal: Goal): GoalInput {
  return {
    name: goal.name,
    targetAmount: goal.targetAmount,
    savedAmount: goal.savedAmount,
    targetDate: goal.targetDate,
    icon: goal.icon,
    color: goal.color,
  };
}

/** Géométrie de l'anneau de progression SVG. */
export function ringGeometry(
  ratio: number,
  radius: number,
): { circumference: number; offset: number } {
  const circumference = 2 * Math.PI * radius;
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return { circumference, offset: circumference * (1 - clamped) };
}

/** Réordonne la liste des objectifs selon des ids (optimiste). */
export function sortGoalsByIds(
  list: readonly GoalProgress[],
  ids: readonly string[],
): GoalProgress[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...list]
    .sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
    .map((g, i) => ({ ...g, sortOrder: i }));
}
