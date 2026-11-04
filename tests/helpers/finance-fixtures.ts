// Jeux de données synthétiques DÉTERMINISTES (PRNG à graine fixe, aucune dépendance)
// partagés par les tests de propriétés, du moteur IA et des services.
import { addDays, listMonths, monthEnd, monthOf, type DateRange } from '@/domain/dates';
import { DEFAULT_TEST_CATEGORIES, categoryId } from '@/domain/ai/__fixtures__/categories';
import type {
  AiCategory,
  AiTransaction,
  BalanceForecast,
  FinanceTools,
  ToolFilter,
} from '@/domain/ai/types';
import type {
  BudgetProgress,
  Category,
  CategoryGroup,
  GoalProgress,
  MonthTotals,
  RecurringRule,
} from '@/domain/types';

export const TODAY = '2026-11-04';
export const HISTORY_START = '2026-05-01';
export const CATEGORIES: AiCategory[] = DEFAULT_TEST_CATEGORIES;

/** PRNG mulberry32 : sortie dans [0, 1), entièrement déterminée par la graine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entier uniforme dans [min, max]. */
export function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

export function pick<T>(rand: () => number, items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) throw new Error('pick : liste vide');
  return item;
}

interface MerchantPool {
  category: string;
  merchants: readonly string[];
  /** Montant en millimes : [min, max] */
  range: readonly [number, number];
  /** Probabilité quotidienne */
  daily: number;
}

const POOLS: readonly MerchantPool[] = [
  {
    category: 'Courses',
    merchants: ['CARREFOUR', 'MONOPRIX', 'AZIZA', 'MAGASIN GENERAL', 'GEANT'],
    range: [20_000, 150_000],
    daily: 0.2,
  },
  {
    category: 'Restaurants',
    merchants: ['PIZZA HUT', 'PLAN B', 'BAGUETTE ET BAGUETTE', 'KFC', 'RESTAURANT LE GOLFE'],
    range: [15_000, 90_000],
    daily: 0.15,
  },
  {
    category: 'Cafés',
    merchants: ['CAFE', 'SALON DE THE', 'PATISSERIE MASMOUDI'],
    range: [1_500, 9_000],
    daily: 0.6,
  },
  {
    category: 'Transport',
    merchants: ['TAXI', 'BOLT', 'TRANSTU METRO'],
    range: [2_000, 25_000],
    daily: 0.3,
  },
  {
    category: 'Carburant',
    merchants: ['AGIL', 'SHELL', 'STATION OLA'],
    range: [40_000, 90_000],
    daily: 0.08,
  },
  {
    category: 'Santé',
    merchants: ['PHARMACIE', 'CLINIQUE', 'LABO ANALYSES'],
    range: [8_000, 120_000],
    daily: 0.04,
  },
  {
    category: 'Shopping',
    merchants: ['ZARA', 'DECATHLON', 'JUMIA'],
    range: [30_000, 200_000],
    daily: 0.04,
  },
  {
    category: 'Loisirs',
    merchants: ['CINEMA PATHE', 'BOWLING', 'CONCERT'],
    range: [10_000, 60_000],
    daily: 0.04,
  },
];

const PREFIXES = ['PAIEMENT CB ', 'ACHAT TPE ', '', '', 'CB '] as const;
const SUFFIXES = [' TUNIS', ' LA MARSA', ' LAC 2', ' ARIANA', '', '', ' SOUSSE'] as const;

/** Libellé bancaire bruité : préfixe, ville, date ou référence aléatoires. */
function noisyLabel(rand: () => number, merchant: string, date: string): string {
  let label = `${pick(rand, PREFIXES)}${merchant}${pick(rand, SUFFIXES)}`;
  const r = rand();
  if (r < 0.25) label += ` ${date.slice(8, 10)}/${date.slice(5, 7)}`;
  else if (r < 0.4) label += ` ${randInt(rand, 100_000, 999_999)}`;
  return label;
}

export const SALARY_RULE: RecurringRule = {
  id: 'rec_salaire',
  accountId: 'acc_bank',
  categoryId: categoryId('Salaire'),
  type: 'INCOME',
  amount: 2_600_000,
  label: 'Salaire',
  frequency: 'MONTHLY',
  startDate: '2026-01-01',
  nextDate: '2026-12-01',
  endDate: null,
  active: true,
  autoCreate: true,
};

export const RENT_RULE: RecurringRule = {
  id: 'rec_loyer',
  accountId: 'acc_bank',
  categoryId: categoryId('Loyer'),
  type: 'EXPENSE',
  amount: 750_000,
  label: 'Loyer',
  frequency: 'MONTHLY',
  startDate: '2026-01-03',
  nextDate: '2026-12-03',
  endDate: null,
  active: true,
  autoCreate: true,
};

export const RULES: RecurringRule[] = [SALARY_RULE, RENT_RULE];

/**
 * Six mois réalistes (1er mai → 4 novembre 2026) : salaire et loyer récurrents, Ooredoo,
 * Netflix, STEG bimestrielle, freelance occasionnel, puis dépenses variées tirées au hasard
 * (graine fixe) avec des libellés bancaires bruités. Quelques virements entre comptes.
 */
export function syntheticHistory(seed = 2026): AiTransaction[] {
  const rand = mulberry32(seed);
  const out: AiTransaction[] = [];
  let n = 0;
  const push = (
    date: string,
    amount: number,
    label: string,
    category: string | null,
    type: AiTransaction['type'] = 'EXPENSE',
    extra: Partial<AiTransaction> = {},
  ) => {
    n++;
    out.push({
      id: `s${String(n).padStart(5, '0')}`,
      date,
      amount,
      type,
      label,
      categoryId: category === null ? null : categoryId(category),
      accountId: type === 'EXPENSE' && rand() < 0.3 ? 'acc_cash' : 'acc_bank',
      recurringId: null,
      ...extra,
    });
  };
  for (let d = HISTORY_START; d <= TODAY; d = addDays(d, 1)) {
    const day = Number(d.slice(8, 10));
    const month = Number(d.slice(5, 7));
    if (day === 1) {
      push(d, 2_600_000, 'VIREMENT SALAIRE SOCIETE ALPHA', 'Salaire', 'INCOME', {
        recurringId: SALARY_RULE.id,
        accountId: 'acc_bank',
      });
    }
    if (day === 3) {
      push(d, 750_000, 'LOYER APPARTEMENT', 'Loyer', 'EXPENSE', {
        recurringId: RENT_RULE.id,
        accountId: 'acc_bank',
      });
    }
    if (day === 10) push(d, 45_000, 'OOREDOO INTERNET FIBRE', 'Télécom');
    if (day === 15) push(d, 39_000, 'NETFLIX.COM', 'Abonnements');
    if (day === 20 && month % 2 === 0) {
      push(d, randInt(rand, 70_000, 140_000), 'STEG FACTURE ELECTRICITE', 'Factures');
    }
    if (day === 22 && month % 3 === 0) {
      push(d, randInt(rand, 300_000, 600_000), 'UPWORK ESCROW PAYMENT', 'Freelance', 'INCOME');
    }
    if (day === 5) {
      push(d, 200_000, 'RETRAIT DAB', null, 'TRANSFER', {
        accountId: 'acc_bank',
      });
    }
    for (const pool of POOLS) {
      if (rand() >= pool.daily) continue;
      const merchant = pick(rand, pool.merchants);
      const amount = randInt(rand, pool.range[0], pool.range[1]);
      push(d, amount, noisyLabel(rand, merchant, d), pool.category);
    }
  }
  return out;
}

// ───────────────────────── Budgets et objectifs ─────────────────────────

export function category(id: string, name: string, group: CategoryGroup = 'NEEDS'): Category {
  return {
    id,
    name,
    kind: group === 'INCOME' ? 'INCOME' : 'EXPENSE',
    group,
    icon: 'Tag',
    color: '#000000',
    sortOrder: 0,
  };
}

export function budgetProgress(
  categoryName: string,
  amount: number,
  spent: number,
  month: string,
): BudgetProgress {
  const id = categoryId(categoryName);
  const ratio = spent / amount;
  return {
    budget: { id: `b_${id}`, categoryId: id, amount, sortOrder: 0 },
    category: category(id, categoryName),
    month,
    spent,
    remaining: amount - spent,
    ratio,
    level: ratio >= 1 ? 'EXCEEDED' : ratio >= 0.8 ? 'WARNING' : 'OK',
    projected: null,
    projectedOverrun: false,
  };
}

export function goalProgress(
  p: Partial<GoalProgress> & Pick<GoalProgress, 'id' | 'name'>,
): GoalProgress {
  return {
    targetAmount: 3_000_000,
    savedAmount: 900_000,
    targetDate: null,
    icon: 'Plane',
    color: '#000000',
    sortOrder: 0,
    completedAt: null,
    ratio: 0.3,
    remaining: 2_100_000,
    monthlyNeeded: null,
    monthsLeft: null,
    status: 'NO_DEADLINE',
    ...p,
  };
}

// ───────────────────────── Agrégats de référence ─────────────────────────

export function monthlyTotals(txs: readonly AiTransaction[], months: string[]): MonthTotals[] {
  return months.map((month) => {
    const inMonth = txs.filter((t) => monthOf(t.date) === month);
    const income = inMonth.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
    const expense = inMonth.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
    return { month, income, expense, net: income - expense };
  });
}

export function sumWhere(
  txs: readonly AiTransaction[],
  pred: (t: AiTransaction) => boolean,
): number {
  return txs.filter(pred).reduce((s, t) => s + t.amount, 0);
}

// ───────────────────────── Outils factices de l'assistant ─────────────────────────

export interface ToolCall {
  name: keyof FinanceTools;
  arg: unknown;
}

export type FakeFinanceTools = FinanceTools & { calls: ToolCall[] };

export interface FakeToolsOptions {
  txs: AiTransaction[];
  budgets?: BudgetProgress[];
  goals?: GoalProgress[];
  recurring?: RecurringRule[];
  balances?: { id: string; name: string; balance: number }[];
  forecast?: BalanceForecast;
}

/** Implémentation en mémoire de FinanceTools, qui journalise chaque appel. */
export function fakeTools(opts: FakeToolsOptions): FakeFinanceTools {
  const calls: ToolCall[] = [];
  const log = (name: keyof FinanceTools, arg: unknown) => calls.push({ name, arg });
  const match = (f: ToolFilter) =>
    opts.txs.filter(
      (t) =>
        t.date >= f.range.from &&
        t.date <= f.range.to &&
        (f.type ? t.type === f.type : t.type !== 'TRANSFER') &&
        (!f.categoryIds || (t.categoryId !== null && f.categoryIds.includes(t.categoryId))) &&
        (!f.search || t.label.toLowerCase().includes(f.search.toLowerCase())),
    );
  const nameOf = (id: string | null) =>
    CATEGORIES.find((c) => c.id === id)?.name ?? 'Sans catégorie';
  const accounts = opts.balances ?? [
    { id: 'acc_bank', name: 'BIAT', balance: 3_250_500 },
    { id: 'acc_cash', name: 'Espèces', balance: 120_750 },
  ];
  const forecast: BalanceForecast = opts.forecast ?? {
    reliability: 'MEDIUM',
    endOfMonth: { date: monthEnd(monthOf(TODAY)), expected: 2_400_000, low: 1_900_000, high: 2_900_000 },
    months: [],
    chart: [],
    monthlyNetEstimate: 350_000,
    explanation: 'factice',
  };
  return {
    calls,
    async sumTransactions(f) {
      log('sumTransactions', f);
      const rows = match(f);
      return { total: rows.reduce((s, t) => s + t.amount, 0), count: rows.length };
    },
    async breakdownByCategory(f) {
      log('breakdownByCategory', f);
      const map = new Map<string | null, { total: number; count: number }>();
      for (const t of match(f)) {
        const cur = map.get(t.categoryId) ?? { total: 0, count: 0 };
        map.set(t.categoryId, { total: cur.total + t.amount, count: cur.count + 1 });
      }
      return [...map]
        .map(([categoryId, v]) => ({ categoryId, name: nameOf(categoryId), ...v }))
        .sort((a, b) => b.total - a.total);
    },
    async monthlyTotals(f) {
      log('monthlyTotals', f);
      return monthlyTotals(match(f), listMonths(monthOf(f.range.from), monthOf(f.range.to)));
    },
    async listTransactions(f) {
      log('listTransactions', f);
      const rows = [...match(f)];
      rows.sort((a, b) =>
        f.sort === 'AMOUNT_DESC' ? b.amount - a.amount : a.date < b.date ? 1 : -1,
      );
      return rows.slice(0, f.limit);
    },
    async topMerchants(f) {
      log('topMerchants', f);
      const map = new Map<string, { total: number; count: number }>();
      for (const t of match(f)) {
        const cur = map.get(t.label) ?? { total: 0, count: 0 };
        map.set(t.label, { total: cur.total + t.amount, count: cur.count + 1 });
      }
      return [...map]
        .map(([label, v]) => ({ label, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, f.limit);
    },
    async budgetStatus(month) {
      log('budgetStatus', month);
      return opts.budgets ?? [];
    },
    async goals() {
      log('goals', null);
      return opts.goals ?? [];
    },
    async balances() {
      log('balances', null);
      return { total: accounts.reduce((s, a) => s + a.balance, 0), accounts };
    },
    async forecast() {
      log('forecast', null);
      return forecast;
    },
    async recurring() {
      log('recurring', null);
      return opts.recurring ?? RULES;
    },
  };
}

export function rangeOf(from: string, to: string): DateRange {
  return { from, to };
}

// ───────────────────────── Parcours générique des sorties ─────────────────────────

/** Toutes les valeurs numériques (chemin → valeur) contenues dans une structure JSON. */
export function numericLeaves(value: unknown, path = '$'): { path: string; value: number }[] {
  if (typeof value === 'number') return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((v, i) => numericLeaves(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numericLeaves(v, `${path}.${k}`));
  }
  return [];
}
