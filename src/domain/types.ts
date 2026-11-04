/**
 * Entités du domaine (objets simples, sérialisables, partagés serveur ↔ client).
 * Montants en millimes (entiers), dates "YYYY-MM-DD", mois "YYYY-MM".
 */
import type { Millimes } from './money';
import type { DateRange, ISODate, YearMonth } from './dates';

export const ACCOUNT_TYPES = ['CASH', 'BANK', 'CARD'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_KINDS = ['EXPENSE', 'INCOME'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Groupe pour la règle 50/30/20 */
export const CATEGORY_GROUPS = ['NEEDS', 'WANTS', 'SAVINGS', 'INCOME'] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

export const CATEGORY_SOURCES = ['USER', 'AI', 'RULE', 'IMPORT', 'RECURRING', 'SEED'] as const;
export type CategorySource = (typeof CATEGORY_SOURCES)[number];

export const FREQUENCIES = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  initialBalance: Millimes;
  color: string;
  archived: boolean;
  sortOrder: number;
}

export interface AccountWithBalance extends Account {
  /** Solde calculé = initial + revenus − dépenses − virements sortants + virements entrants */
  balance: Millimes;
  transactionCount: number;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  group: CategoryGroup;
  /** Nom d'icône lucide-react */
  icon: string;
  color: string;
  sortOrder: number;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: TransactionType;
  /** Toujours positif ; le signe est porté par `type` */
  amount: Millimes;
  date: ISODate;
  label: string;
  note: string | null;
  /** Noms des tags */
  tags: string[];
  transferAccountId: string | null;
  recurringId: string | null;
  categorySource: CategorySource | null;
  aiConfidence: number | null;
  /** ISO datetime */
  createdAt: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  /** Plafond mensuel */
  amount: Millimes;
  sortOrder: number;
}

export type BudgetLevel = 'OK' | 'WARNING' | 'EXCEEDED';

export interface BudgetProgress {
  budget: Budget;
  category: Category;
  month: YearMonth;
  spent: Millimes;
  /** Peut être négatif en cas de dépassement */
  remaining: Millimes;
  /** spent / amount (0..∞) */
  ratio: number;
  /** OK < 80 % ≤ WARNING < 100 % ≤ EXCEEDED */
  level: BudgetLevel;
  /** Dépense projetée en fin de mois au rythme actuel (null si mois passé/futur) */
  projected: Millimes | null;
  /** Le rythme actuel mènera au dépassement */
  projectedOverrun: boolean;
}

export interface Goal {
  id: string;
  name: string;
  targetAmount: Millimes;
  savedAmount: Millimes;
  targetDate: ISODate | null;
  icon: string;
  color: string;
  sortOrder: number;
  /** ISO datetime */
  completedAt: string | null;
}

export interface GoalProgress extends Goal {
  ratio: number;
  remaining: Millimes;
  /** Épargne mensuelle nécessaire pour tenir la date cible (null si pas de date ou atteint) */
  monthlyNeeded: Millimes | null;
  /** Mois restants jusqu'à la date cible (null si pas de date) */
  monthsLeft: number | null;
  status: 'COMPLETED' | 'ON_TRACK' | 'AT_RISK' | 'NO_DEADLINE' | 'OVERDUE';
}

export interface RecurringRule {
  id: string;
  accountId: string;
  categoryId: string | null;
  type: Exclude<TransactionType, 'TRANSFER'>;
  amount: Millimes;
  label: string;
  frequency: Frequency;
  startDate: ISODate;
  nextDate: ISODate;
  endDate: ISODate | null;
  active: boolean;
  autoCreate: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  currency: string;
  onboarded: boolean;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export type SortDirection = 'asc' | 'desc';

export interface TransactionQuery {
  /** 1-based */
  page: number;
  pageSize: number;
  search?: string;
  types?: TransactionType[];
  accountIds?: string[];
  categoryIds?: string[];
  /** Filtre « sans catégorie » */
  uncategorized?: boolean;
  tag?: string;
  from?: ISODate;
  to?: ISODate;
  minAmount?: Millimes;
  maxAmount?: Millimes;
  sort: { field: 'date' | 'amount' | 'label'; direction: SortDirection };
}

export interface TransactionTotals {
  income: Millimes;
  expense: Millimes;
  net: Millimes;
  count: number;
}

export interface MonthTotals {
  month: YearMonth;
  income: Millimes;
  expense: Millimes;
  net: Millimes;
}

export interface CategorySlice {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  amount: Millimes;
  /** Part du total (0..1) */
  share: number;
  count: number;
}

export type InsightKind =
  'RULE_50_30_20' | 'CATEGORY_SPIKE' | 'FORGOTTEN_SUBSCRIPTION' | 'BUDGET_ALERT' | 'SAVINGS_RATE';

export type Severity = 'INFO' | 'SUCCESS' | 'WARNING' | 'DANGER';

export interface Insight {
  /** Clé stable (permet d'ignorer le conseil) */
  key: string;
  kind: InsightKind;
  severity: Severity;
  title: string;
  message: string;
  categoryId?: string;
  /** Lien d'action interne (ex. "/transactions?categoryId=…") */
  href?: string;
}

export interface DashboardData {
  today: ISODate;
  month: YearMonth;
  totalBalance: Millimes;
  accounts: AccountWithBalance[];
  current: TransactionTotals;
  previous: TransactionTotals;
  /** (dépenses du mois − mois précédent) / mois précédent ; null si pas de référence */
  expenseChange: number | null;
  /** Budgets totaux − dépenses budgétées du mois ; null s'il n'y a pas de budget */
  remainingToSpend: Millimes | null;
  /** Reste à dépenser par jour restant ; null s'il n'y a pas de budget */
  dailyAllowance: Millimes | null;
  byCategory: CategorySlice[];
  /** 12 derniers mois, du plus ancien au plus récent */
  monthly: MonthTotals[];
  topExpenses: Transaction[];
  budgetAlerts: BudgetProgress[];
  insights: Insight[];
  upcomingRecurring: RecurringRule[];
}

/** Ligne normalisée issue d'un CSV, après mapping des colonnes (avant envoi au serveur). */
export interface ImportRow {
  /** Index de la ligne dans le fichier (pour l'affichage) */
  index: number;
  date: ISODate;
  label: string;
  amount: Millimes;
  type: Exclude<TransactionType, 'TRANSFER'>;
  note?: string;
}

export interface ImportPreviewRow extends ImportRow {
  importHash: string;
  /** Doublon exact d'une transaction existante ou d'une autre ligne du fichier */
  duplicate: 'NONE' | 'EXISTING' | 'IN_FILE';
  suggestedCategoryId: string | null;
  suggestionConfidence: number | null;
}

export interface ImportCommitResult {
  created: number;
  skipped: number;
}

export type { DateRange, ISODate, Millimes, YearMonth };
