import { describe, expect, it } from 'vitest';
import { formatMoney } from '../../money';
import { listMonths, monthOf, type DateRange } from '../../dates';
import type { BudgetProgress, GoalProgress, MonthTotals, RecurringRule } from '../../types';
import type {
  AiCategory,
  AiTransaction,
  AssistantContext,
  BalanceForecast,
  FinanceTools,
  ToolFilter,
} from '../types';
import { askAssistant, EXAMPLE_QUESTIONS } from './index';
import { buildTransactionsHref, monthlyEquivalent, resolveComparison } from './answers';
import { parsePeriods } from './periods';

const TODAY = '2026-03-18';

const CATS: AiCategory[] = [
  { id: 'c_courses', name: 'Courses', kind: 'EXPENSE' },
  { id: 'c_resto', name: 'Restaurants', kind: 'EXPENSE' },
  { id: 'c_cafes', name: 'Cafés', kind: 'EXPENSE' },
  { id: 'c_transport', name: 'Transport', kind: 'EXPENSE' },
  { id: 'c_carburant', name: 'Carburant', kind: 'EXPENSE' },
  { id: 'c_loyer', name: 'Loyer', kind: 'EXPENSE' },
  { id: 'c_factures', name: 'Factures', kind: 'EXPENSE' },
  { id: 'c_telecom', name: 'Télécom', kind: 'EXPENSE' },
  { id: 'c_sante', name: 'Santé', kind: 'EXPENSE' },
  { id: 'c_shopping', name: 'Shopping', kind: 'EXPENSE' },
  { id: 'c_loisirs', name: 'Loisirs', kind: 'EXPENSE' },
  { id: 'c_abos', name: 'Abonnements', kind: 'EXPENSE' },
  { id: 'c_edu', name: 'Éducation', kind: 'EXPENSE' },
  { id: 'c_famille', name: 'Famille & cadeaux', kind: 'EXPENSE' },
  { id: 'c_epargne', name: 'Épargne', kind: 'EXPENSE' },
  { id: 'c_divers', name: 'Divers', kind: 'EXPENSE' },
  { id: 'c_salaire', name: 'Salaire', kind: 'INCOME' },
  { id: 'c_freelance', name: 'Freelance', kind: 'INCOME' },
  { id: 'c_autres', name: 'Autres revenus', kind: 'INCOME' },
];

let seq = 0;
function tx(
  date: string,
  amount: number,
  categoryId: string | null,
  label: string,
  type: AiTransaction['type'] = 'EXPENSE',
): AiTransaction {
  seq++;
  return { id: `t${seq}`, date, amount, type, label, categoryId, accountId: 'a1', recurringId: null };
}

function buildHistory(): AiTransaction[] {
  const out: AiTransaction[] = [];
  for (const ym of listMonths('2025-01', '2026-03')) {
    out.push(tx(`${ym}-01`, 2_600_000, 'c_salaire', 'SALAIRE', 'INCOME'));
    out.push(tx(`${ym}-03`, 750_000, 'c_loyer', 'LOYER'));
    out.push(tx(`${ym}-05`, 120_000, 'c_courses', 'CARREFOUR'));
    out.push(tx(`${ym}-12`, 95_500, 'c_courses', 'MONOPRIX'));
    out.push(tx(`${ym}-08`, 45_000, 'c_resto', 'PIZZERIA'));
    out.push(tx(`${ym}-09`, 3_500, 'c_cafes', 'CAFE'));
    out.push(tx(`${ym}-10`, 60_000, 'c_factures', 'STEG'));
    out.push(tx(`${ym}-11`, 49_000, 'c_telecom', 'OOREDOO'));
    out.push(tx(`${ym}-14`, 70_000, 'c_carburant', 'AGIL'));
    out.push(tx(`${ym}-02`, 200_000, null, 'RETRAIT DAB', 'TRANSFER'));
  }
  out.push(tx('2026-02-20', 380_000, 'c_resto', 'RESTAURANT DAR EL JELD'));
  out.push(tx('2026-03-15', 40_000, 'c_loisirs', 'CINEMA'));
  out.push(tx('2026-03-17', 25_000, 'c_sante', 'PHARMACIE'));
  return out;
}

const FORECAST: BalanceForecast = {
  reliability: 'MEDIUM',
  endOfMonth: { date: '2026-03-31', expected: 1_500_000, low: 1_100_000, high: 1_900_000 },
  months: [
    { date: '2026-04-30', expected: 2_000_000, low: 1_400_000, high: 2_600_000 },
    { date: '2026-05-31', expected: 2_400_000, low: 1_600_000, high: 3_200_000 },
  ],
  chart: [
    { month: '2026-02', actual: 1_300_000, expected: null, low: null, high: null },
    { month: '2026-03', actual: null, expected: 1_500_000, low: 1_100_000, high: 1_900_000 },
  ],
  monthlyNetEstimate: 400_000,
  explanation: 'test',
};

function goal(p: Partial<GoalProgress> & { id: string; name: string }): GoalProgress {
  return {
    targetAmount: 1_500_000,
    savedAmount: 600_000,
    targetDate: null,
    icon: 'Plane',
    color: '#000000',
    sortOrder: 0,
    completedAt: null,
    ratio: 0.4,
    remaining: 900_000,
    monthlyNeeded: null,
    monthsLeft: null,
    status: 'NO_DEADLINE',
    ...p,
  };
}

const GOALS: GoalProgress[] = [
  goal({ id: 'g1', name: 'Voyage à Djerba', targetDate: '2026-08-18', monthlyNeeded: 180_000, status: 'ON_TRACK' }),
  goal({ id: 'g2', name: "Fonds d'urgence", targetAmount: 6_000_000, savedAmount: 2_100_000, ratio: 0.35 }),
];

const RULES: RecurringRule[] = [
  {
    id: 'r1',
    accountId: 'a1',
    categoryId: 'c_loyer',
    type: 'EXPENSE',
    amount: 750_000,
    label: 'Loyer',
    frequency: 'MONTHLY',
    startDate: '2025-01-03',
    nextDate: '2026-04-03',
    endDate: null,
    active: true,
    autoCreate: true,
  },
  {
    id: 'r2',
    accountId: 'a1',
    categoryId: 'c_telecom',
    type: 'EXPENSE',
    amount: 49_000,
    label: 'Internet Ooredoo',
    frequency: 'MONTHLY',
    startDate: '2025-01-11',
    nextDate: '2026-03-25',
    endDate: null,
    active: true,
    autoCreate: true,
  },
  {
    id: 'r3',
    accountId: 'a1',
    categoryId: 'c_salaire',
    type: 'INCOME',
    amount: 2_600_000,
    label: 'Salaire',
    frequency: 'MONTHLY',
    startDate: '2025-01-01',
    nextDate: '2026-04-01',
    endDate: null,
    active: true,
    autoCreate: true,
  },
];

interface FakeOptions {
  txs?: AiTransaction[];
  goals?: GoalProgress[];
  recurring?: RecurringRule[];
  budgets?: { categoryId: string; amount: number }[];
  accounts?: { id: string; name: string; balance: number }[];
  forecast?: BalanceForecast;
  fail?: boolean;
}

type FakeTools = FinanceTools & { calls: { name: string; arg: unknown }[] };

function makeTools(opts: FakeOptions = {}): FakeTools {
  const txs = opts.txs ?? buildHistory();
  const calls: { name: string; arg: unknown }[] = [];
  const log = (name: string, arg: unknown) => {
    calls.push({ name, arg });
    if (opts.fail) throw new Error('base indisponible');
  };
  const match = (f: ToolFilter) =>
    txs.filter(
      (t) =>
        t.date >= f.range.from &&
        t.date <= f.range.to &&
        (f.type ? t.type === f.type : t.type !== 'TRANSFER') &&
        (!f.categoryIds || (t.categoryId !== null && f.categoryIds.includes(t.categoryId))) &&
        (!f.search || t.label.toLowerCase().includes(f.search.toLowerCase())),
    );
  const catName = (id: string | null) => CATS.find((c) => c.id === id)?.name ?? 'Sans catégorie';
  const budgets = opts.budgets ?? [
    { categoryId: 'c_courses', amount: 450_000 },
    { categoryId: 'c_resto', amount: 30_000 },
    { categoryId: 'c_cafes', amount: 4_000 },
  ];
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
      return [...map].map(([categoryId, v]) => ({ categoryId, name: catName(categoryId), ...v }));
    },
    async monthlyTotals(f) {
      log('monthlyTotals', f);
      const rows = match(f);
      return listMonths(monthOf(f.range.from), monthOf(f.range.to)).map((month): MonthTotals => {
        const inMonth = rows.filter((t) => monthOf(t.date) === month);
        const income = inMonth.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
        const expense = inMonth.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0);
        return { month, income, expense, net: income - expense };
      });
    },
    async listTransactions(f) {
      log('listTransactions', f);
      const rows = [...match(f)];
      rows.sort((a, b) => (f.sort === 'AMOUNT_DESC' ? b.amount - a.amount : a.date < b.date ? 1 : -1));
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
      return budgets.map((b, i): BudgetProgress => {
        const range: DateRange = { from: `${month}-01`, to: `${month}-31` };
        const spent = match({ range, type: 'EXPENSE', categoryIds: [b.categoryId] }).reduce(
          (s, t) => s + t.amount,
          0,
        );
        const ratio = spent / b.amount;
        return {
          budget: { id: `b${i}`, categoryId: b.categoryId, amount: b.amount, sortOrder: i },
          category: {
            id: b.categoryId,
            name: catName(b.categoryId),
            kind: 'EXPENSE',
            group: 'NEEDS',
            icon: 'Tag',
            color: '#000000',
            sortOrder: i,
          },
          month,
          spent,
          remaining: b.amount - spent,
          ratio,
          level: ratio >= 1 ? 'EXCEEDED' : ratio >= 0.8 ? 'WARNING' : 'OK',
          projected: spent * 2,
          projectedOverrun: spent * 2 > b.amount,
        };
      });
    },
    async goals() {
      log('goals', null);
      return opts.goals ?? GOALS;
    },
    async balances() {
      log('balances', null);
      const accounts = opts.accounts ?? [
        { id: 'a1', name: 'BIAT', balance: 1_200_000 },
        { id: 'a2', name: 'Espèces', balance: 85_500 },
      ];
      return { total: accounts.reduce((s, a) => s + a.balance, 0), accounts };
    },
    async forecast() {
      log('forecast', null);
      return opts.forecast ?? FORECAST;
    },
    async recurring() {
      log('recurring', null);
      return opts.recurring ?? RULES;
    },
  };
}

const CTX: AssistantContext = {
  today: TODAY,
  categories: CATS,
  accounts: [{ id: 'a1', name: 'BIAT' }],
  goals: GOALS.map((g) => ({ id: g.id, name: g.name })),
};

const ask = (q: string, tools: FinanceTools = makeTools(), ctx: AssistantContext = CTX) =>
  askAssistant(q, ctx, tools);

/** [question, intention, from, to, catégorie attendue dans les filtres (ou null)] */
type Case = [string, string, string | null, string | null, string | null];

const REFERENCE: Case[] = [
  ['combien j’ai dépensé en restaurants ce trimestre ?', 'SPENDING_TOTAL', '2026-01-01', '2026-03-31', 'c_resto'],
  ['mes plus grosses dépenses du mois dernier', 'BIGGEST_EXPENSE', '2026-02-01', '2026-02-28', null],
  ['je dépense plus que le mois dernier ?', 'COMPARE_PERIODS', '2026-03-01', '2026-03-31', null],
  ['il me reste combien dans mon budget courses ?', 'BUDGET_STATUS', '2026-03-01', '2026-03-31', null],
  ['quel est mon solde ?', 'BALANCE', null, null, null],
  ['combien j’aurai à la fin du mois ?', 'FORECAST', '2026-03-18', '2026-03-31', null],
  ['est-ce que je peux me permettre un téléphone à 900 dinars ?', 'CAN_AFFORD', '2026-03-18', '2026-03-31', null],
  ['quand vais-je atteindre mon objectif voyage ?', 'GOAL_PROGRESS', null, null, null],
  ['mes abonnements', 'SUBSCRIPTIONS', null, null, null],
  ['taux d’épargne cette année', 'SAVINGS_RATE', '2026-01-01', '2026-12-31', null],
  ['Combien j’ai dépensé en resto ce mois ?', 'SPENDING_TOTAL', '2026-03-01', '2026-03-31', 'c_resto'],
  ['combien j’ai gagné depuis janvier ?', 'INCOME_TOTAL', '2026-01-01', '2026-03-18', null],
  ['je dépense plus qu’en janvier ?', 'COMPARE_PERIODS', '2026-03-01', '2026-03-31', null],
  ['où part mon argent ce trimestre ?', 'TOP_CATEGORIES', '2026-01-01', '2026-03-31', null],
  ['mes plus gros commerçants', 'TOP_MERCHANTS', '2026-03-01', '2026-03-31', null],
  ['ma plus grosse dépense le mois dernier', 'BIGGEST_EXPENSE', '2026-02-01', '2026-02-28', null],
  ['combien je dépense en moyenne en courses ?', 'AVERAGE_SPENDING', '2025-12-01', '2026-02-28', 'c_courses'],
  ['il me reste combien en budget loisirs ?', 'BUDGET_STATUS', '2026-03-01', '2026-03-31', 'c_loisirs'],
  ['je peux acheter un téléphone à 900 dinars ?', 'CAN_AFFORD', '2026-03-18', '2026-03-31', null],
  ['quand j’atteins mon objectif voyage ?', 'GOAL_PROGRESS', null, null, null],
  ['quel est mon taux d’épargne ?', 'SAVINGS_RATE', '2026-03-01', '2026-03-31', null],
  ['combien j’ai dépensé en bouffe la semaine dernière ?', 'SPENDING_TOTAL', '2026-03-09', '2026-03-15', 'c_courses'],
  ['dépenses essence ce mois-ci', 'SPENDING_TOTAL', '2026-03-01', '2026-03-31', 'c_carburant'],
  ['combien pour internet en février ?', 'SPENDING_TOTAL', '2026-02-01', '2026-02-28', 'c_telecom'],
  ['mes dépenses en électricité l’an dernier', 'SPENDING_TOTAL', '2025-01-01', '2025-12-31', 'c_factures'],
  ['combien j’ai claqué en sorties ce week-end ?', 'SPENDING_TOTAL', '2026-03-14', '2026-03-15', 'c_loisirs'],
  ['combien en cafés les 30 derniers jours ?', 'SPENDING_TOTAL', '2026-02-17', '2026-03-18', 'c_cafes'],
  ['combien j’ai dépensé chez le médecin les 3 derniers mois ?', 'SPENDING_TOTAL', '2025-12-19', '2026-03-18', 'c_sante'],
  ['combien j’ai dépensé hier ?', 'SPENDING_TOTAL', '2026-03-17', '2026-03-17', null],
  ['combien j’ai dépensé aujourd’hui ?', 'SPENDING_TOTAL', '2026-03-18', '2026-03-18', null],
  ['combien j’ai dépensé entre le 1er et le 10 mars ?', 'SPENDING_TOTAL', '2026-03-01', '2026-03-10', null],
  ['combien j’ai dépensé en mars 2025 ?', 'SPENDING_TOTAL', '2025-03-01', '2025-03-31', null],
  ['combien j’ai dépensé en décembre ?', 'SPENDING_TOTAL', '2025-12-01', '2025-12-31', null],
  ['quel sera mon solde fin de mois ?', 'FORECAST', '2026-03-18', '2026-03-31', null],
  ['répartition de mes dépenses le trimestre dernier', 'TOP_CATEGORIES', '2025-10-01', '2025-12-31', null],
  ['ce trimestre par rapport au trimestre dernier', 'COMPARE_PERIODS', '2026-01-01', '2026-03-31', null],
  ['combien j’ai économisé cette année ?', 'SAVINGS_RATE', '2026-01-01', '2026-12-31', null],
  ['mes charges fixes', 'SUBSCRIPTIONS', null, null, null],
  ['où en sont mes objectifs ?', 'GOAL_PROGRESS', null, null, null],
  ['combien j’ai sur mes comptes ?', 'BALANCE', null, null, null],
  ['quel est mon salaire ce mois-ci ?', 'INCOME_TOTAL', '2026-03-01', '2026-03-31', 'c_salaire'],
  ['dépense moyenne par mois en transport', 'AVERAGE_SPENDING', '2025-12-01', '2026-02-28', 'c_transport'],
  ['est-ce que j’ai dépassé mon budget restaurants ?', 'BUDGET_STATUS', '2026-03-01', '2026-03-31', null],
  ['combien je vais avoir dans 3 mois ?', 'FORECAST', '2026-03-18', '2026-03-31', null],
  ['mes 5 plus grosses dépenses depuis le début de l’année', 'BIGGEST_EXPENSE', '2026-01-01', '2026-03-18', null],
  ['j’ai les moyens de m’offrir une console à 1 200 dt ?', 'CAN_AFFORD', '2026-03-18', '2026-03-31', null],
  ['combien de dépenses en supermarché du 01/02 au 15/02 ?', 'SPENDING_TOTAL', '2026-02-01', '2026-02-15', 'c_courses'],
  ['mes courses ce mois-ci comparées au mois dernier', 'COMPARE_PERIODS', '2026-03-01', '2026-03-31', 'c_courses'],
  ['quels sont mes revenus en freelance cette année ?', 'INCOME_TOTAL', '2026-01-01', '2026-12-31', 'c_freelance'],
  ['quelle heure est-il ?', 'UNKNOWN', null, null, null],
  ['bonjour', 'UNKNOWN', null, null, null],
  ['raconte-moi une blague', 'UNKNOWN', null, null, null],
];

function filtersOf(tools: FakeTools): ToolFilter[] {
  return tools.calls
    .map((c) => c.arg)
    .filter((a): a is ToolFilter => typeof a === 'object' && a !== null && 'range' in a);
}

describe('askAssistant — questions de référence', () => {
  it('contient au moins 40 questions de référence', () => {
    expect(REFERENCE.length).toBeGreaterThanOrEqual(40);
  });

  it.each(REFERENCE)('« %s » → %s', async (question, intent, from, to, categoryId) => {
    const tools = makeTools();
    const a = await ask(question, tools);
    expect(a.intent).toBe(intent);
    expect(a.understood).toBe(intent !== 'UNKNOWN');
    if (from && to) {
      expect(a.period).not.toBeNull();
      expect(a.period?.from).toBe(from);
      expect(a.period?.to).toBe(to);
    }
    if (categoryId) {
      expect(filtersOf(tools).some((f) => f.categoryIds?.includes(categoryId))).toBe(true);
    }
    if (intent === 'UNKNOWN') {
      expect(a.suggestions.length).toBeGreaterThanOrEqual(3);
      expect(a.suggestions.length).toBeLessThanOrEqual(4);
      expect(tools.calls).toHaveLength(0);
    }
    expect(a.text.length).toBeGreaterThan(10);
  });
});

describe('askAssistant — contenu des réponses', () => {
  it('total de dépenses : montant issu des outils, graphique mensuel, lien filtré', async () => {
    const a = await ask('combien j’ai dépensé en restaurants ce trimestre ?');
    // 3 × 45 DT + 380 DT
    expect(a.text).toContain(formatMoney(515_000));
    expect(a.text).toContain('Restaurants');
    expect(a.period?.label).toBe('ce trimestre');
    expect(a.chart?.kind).toBe('bar');
    expect(a.chart?.data.map((d) => d.label)).toHaveLength(3);
    expect(a.href).toBe(
      '/transactions?categoryId=c_resto&from=2026-01-01&to=2026-03-31&type=EXPENSE',
    );
    expect(a.highlights[0]).toEqual({ label: 'Dépenses Restaurants', value: 515_000, format: 'money' });
  });

  it('aucune dépense : texte adapté, pas de graphique', async () => {
    const a = await ask('combien j’ai dépensé en shopping ce mois ?');
    expect(a.text).toMatch(/Aucune dépense en Shopping/);
    expect(a.chart).toBeNull();
  });

  it('plus grosses dépenses : classées par montant', async () => {
    const a = await ask('mes plus grosses dépenses du mois dernier');
    expect(a.text).toContain('RESTAURANT DAR EL JELD');
    expect(a.text).toContain('a été');
    expect(a.highlights[0]?.value).toBe(750_000);
    expect(a.chart?.data.map((d) => d.value)).toEqual([750_000, 380_000, 120_000, 95_500, 70_000]);
  });

  it('comparaison à date avec le mois précédent', async () => {
    const a = await ask('je dépense plus que le mois dernier ?');
    // Mars au 18 : 750+120+95,5+45+3,5+60+49+70+40 (ciné 15) = 1233 ; + pharmacie 17 → 1258 DT
    // Février au 18 : mêmes postes sans ciné/pharmacie = 1193 DT
    expect(a.highlights[0]?.value).toBe(1_258_000);
    expect(a.highlights[1]?.value).toBe(1_193_000);
    expect(a.highlights[2]?.format).toBe('percent');
    expect(a.text).toMatch(/en hausse/);
    expect(a.text).toMatch(/À date|à date/);
    expect(a.chart?.data).toHaveLength(2);
    expect(a.chart?.data[0]?.label).toBe('Le mois dernier');
  });

  it('comparaison de deux périodes passées explicites', async () => {
    const a = await ask('mes dépenses en restaurants en février par rapport à janvier');
    expect(a.intent).toBe('COMPARE_PERIODS');
    expect(a.highlights[0]?.value).toBe(425_000);
    expect(a.highlights[1]?.value).toBe(45_000);
    expect(a.text).toMatch(/hausse/);
  });

  it('comparaison sans données', async () => {
    const a = await ask('je dépense plus que le mois dernier ?', makeTools({ txs: [] }));
    expect(a.text).toMatch(/rien à comparer/);
    const b = await ask(
      'je dépense plus que le mois dernier ?',
      makeTools({ txs: [tx('2026-03-02', 10_000, 'c_cafes', 'CAFE')] }),
    );
    expect(b.text).toMatch(/pas de comparaison possible/);
  });

  it('répartition : camembert avec « Autres »', async () => {
    const a = await ask('où part mon argent ce trimestre ?');
    expect(a.chart?.kind).toBe('pie');
    expect(a.chart?.data.at(-1)?.label).toBe('Autres');
    expect(a.text).toMatch(/Loyer/);
    expect(a.highlights).toHaveLength(3);
  });

  it('répartition vide', async () => {
    const a = await ask('où part mon argent ce mois ?', makeTools({ txs: [] }));
    expect(a.text).toMatch(/Aucune dépense/);
  });

  it('commerçants', async () => {
    const a = await ask('mes plus gros commerçants');
    expect(a.text).toContain('LOYER');
    expect(a.chart?.kind).toBe('bar');
    const empty = await ask('mes plus gros commerçants', makeTools({ txs: [] }));
    expect(empty.text).toMatch(/Aucune dépense/);
  });

  it('moyenne mensuelle sur 3 mois complets', async () => {
    const a = await ask('combien je dépense en moyenne en courses ?');
    expect(a.highlights[0]?.value).toBe(215_500);
    expect(a.text).toContain(formatMoney(215_500));
    const empty = await ask('combien je dépense en moyenne en courses ?', makeTools({ txs: [] }));
    expect(empty.text).toMatch(/pas de moyenne/);
  });

  it('budget d’une catégorie : reste, dépassement, absence', async () => {
    const courses = await ask('il me reste combien dans mon budget courses ?');
    expect(courses.text).toContain(`Il vous reste ${formatMoney(234_500)}`);
    const resto = await ask('il me reste combien dans mon budget resto ?');
    expect(resto.text).toMatch(/dépassé de/);
    const loisirs = await ask('il me reste combien en budget loisirs ?');
    expect(loisirs.text).toMatch(/pas de budget pour Loisirs/);
    expect(loisirs.text).toContain(formatMoney(40_000));
  });

  it('budgets globaux et absence de budgets', async () => {
    const all = await ask('où en sont mes budgets ?');
    expect(all.text).toMatch(/Dépassé/);
    expect(all.chart?.data).toHaveLength(3);
    const none = await ask('où en sont mes budgets ?', makeTools({ budgets: [] }));
    expect(none.text).toMatch(/pas encore de budget/);
    expect(none.href).toBe('/budgets');
    const calm = await ask(
      'où en sont mes budgets ?',
      makeTools({ budgets: [{ categoryId: 'c_courses', amount: 5_000_000 }] }),
    );
    expect(calm.text).toMatch(/sous contrôle/);
  });

  it('solde', async () => {
    const a = await ask('quel est mon solde ?');
    expect(a.text).toContain(formatMoney(1_285_500));
    expect(a.href).toBe('/comptes');
    const one = await ask(
      'quel est mon solde ?',
      makeTools({ accounts: [{ id: 'a', name: 'BIAT', balance: 10_000 }] }),
    );
    expect(one.text).toMatch(/sur votre compte BIAT/);
    const none = await ask('quel est mon solde ?', makeTools({ accounts: [] }));
    expect(none.text).toMatch(/aucun compte/);
  });

  it('prévision de fin de mois et des mois suivants', async () => {
    const a = await ask('combien j’aurai à la fin du mois ?');
    expect(a.text).toContain(formatMoney(1_500_000));
    expect(a.chart?.kind).toBe('line');
    const b = await ask('quelle est la prévision pour les prochains mois ?');
    expect(b.text).toContain(formatMoney(2_400_000));
  });

  it('achat envisagé : oui / serré / non / montant manquant', async () => {
    const yes = await ask('est-ce que je peux me permettre un téléphone à 900 dinars ?');
    expect(yes.text).toMatch(/^Oui/);
    expect(yes.highlights[0]?.value).toBe(900_000);
    const tight = await ask('je peux m’offrir une télé à 1300 dt ?');
    expect(tight.text).toMatch(/serré/);
    const no = await ask('est-ce que je peux me permettre une moto à 2k ?');
    expect(no.highlights[0]?.value).toBe(2_000_000);
    expect(no.text).toMatch(/patienter/);
    const missing = await ask('est-ce que je peux me permettre un voyage ?');
    expect(missing.text).toMatch(/montant/);
    expect(missing.highlights).toHaveLength(0);
  });

  it('abonnements : total mensuel des dépenses récurrentes actives', async () => {
    const a = await ask('mes abonnements');
    expect(a.text).toContain(formatMoney(799_000));
    expect(a.text).toMatch(/Internet Ooredoo, le 25 mars/);
    expect(a.chart?.kind).toBe('pie');
    const none = await ask('mes abonnements', makeTools({ recurring: [] }));
    expect(none.text).toMatch(/aucune dépense récurrente/);
  });

  it('objectif nommé : date estimée par l’épargne médiane', async () => {
    const a = await ask('quand vais-je atteindre mon objectif voyage ?');
    expect(a.text).toContain('Voyage à Djerba');
    expect(a.text).toMatch(/vers (avril|mai) 2026/);
    expect(a.text).toContain(formatMoney(180_000));
    expect(a.chart?.kind).toBe('line');
  });

  it('objectifs : liste, aucun, atteint, épargne négative, échéance dépassée', async () => {
    const list = await ask('où en sont mes objectifs ?');
    expect(list.text).toMatch(/2 objectifs/);
    expect(list.suggestions[0]).toMatch(/Voyage à Djerba/);
    const none = await ask('où en sont mes objectifs ?', makeTools({ goals: [] }));
    expect(none.text).toMatch(/pas encore d'objectif/);
    const done = await ask(
      'mon objectif voyage ?',
      makeTools({ goals: [goal({ id: 'g', name: 'Voyage', savedAmount: 1_500_000, status: 'COMPLETED', ratio: 1 })] }),
    );
    expect(done.text).toMatch(/Bravo/);
    const negative = await ask(
      'quand vais-je atteindre mon objectif ?',
      makeTools({
        txs: [tx('2026-02-02', 900_000, 'c_loyer', 'LOYER')],
        goals: [goal({ id: 'g', name: 'Voiture', targetDate: '2025-12-01', status: 'OVERDUE' })],
      }),
    );
    expect(negative.text).toMatch(/ne permet pas/);
    expect(negative.text).toMatch(/dépassée/);
  });

  it('taux d’épargne : positif, négatif, sans revenu', async () => {
    const a = await ask('quel est mon taux d’épargne le mois dernier ?');
    expect(a.highlights[0]?.format).toBe('percent');
    expect(a.text).toMatch(/taux d'épargne est de/);
    const neg = await ask(
      'mon taux d’épargne ce mois',
      makeTools({
        txs: [
          tx('2026-03-01', 1_000_000, 'c_salaire', 'SALAIRE', 'INCOME'),
          tx('2026-03-02', 1_200_000, 'c_loyer', 'LOYER'),
        ],
      }),
    );
    expect(neg.text).toMatch(/négatif/);
    const noIncome = await ask(
      'mon taux d’épargne ce mois',
      makeTools({ txs: [tx('2026-03-02', 1_000, 'c_cafes', 'CAFE')] }),
    );
    expect(noIncome.text).toMatch(/aucun revenu/);
    const nothing = await ask('mon taux d’épargne ce mois', makeTools({ txs: [] }));
    expect(nothing.text).toMatch(/aucun revenu/);
  });

  it('revenus', async () => {
    const a = await ask('combien j’ai gagné depuis janvier ?');
    expect(a.text).toContain(formatMoney(7_800_000));
    const none = await ask('combien j’ai gagné ce mois ?', makeTools({ txs: [] }));
    expect(none.text).toMatch(/Aucun revenu/);
  });

  it('erreur d’outil : excuse, sans chiffres', async () => {
    const a = await ask('combien j’ai dépensé ce mois ?', makeTools({ fail: true }));
    expect(a.understood).toBe(true);
    expect(a.intent).toBe('SPENDING_TOTAL');
    expect(a.text).toMatch(/Désolé/);
    expect(a.text).not.toMatch(/\d/);
    expect(a.highlights).toHaveLength(0);
    expect(a.chart).toBeNull();
  });

  it('non compris : suggestions proches de l’intention probable', async () => {
    const hello = await ask('bonjour');
    expect(hello.text).toMatch(/^Bonjour/);
    expect(hello.suggestions.length).toBe(4);
    const vague = await ask('le total');
    expect(vague.understood).toBe(false);
    expect(vague.suggestions[0]).toMatch(/dépensé/);
    expect(new Set(vague.suggestions).size).toBe(vague.suggestions.length);
  });

  it('EXAMPLE_QUESTIONS : 8 questions toutes comprises', async () => {
    expect(EXAMPLE_QUESTIONS).toHaveLength(8);
    for (const q of EXAMPLE_QUESTIONS) {
      const a = await ask(q);
      expect(a.understood, q).toBe(true);
    }
  });
});

describe('utilitaires des réponses', () => {
  it('buildTransactionsHref encode les paramètres', () => {
    expect(buildTransactionsHref({})).toBe('/transactions');
    expect(buildTransactionsHref({ q: 'café & thé', type: 'INCOME' })).toBe(
      '/transactions?type=INCOME&q=caf%C3%A9%20%26%20th%C3%A9',
    );
  });

  it('monthlyEquivalent', () => {
    expect(monthlyEquivalent({ amount: 12_000, frequency: 'WEEKLY' })).toBe(52_000);
    expect(monthlyEquivalent({ amount: 90_000, frequency: 'QUARTERLY' })).toBe(30_000);
    expect(monthlyEquivalent({ amount: 120_000, frequency: 'YEARLY' })).toBe(10_000);
  });

  it('resolveComparison : période seule passée → période courante de même nature', () => {
    const [a, b] = resolveComparison(parsePeriods('l an dernier', TODAY), TODAY);
    expect(a.from).toBe('2026-01-01');
    expect(b.from).toBe('2025-01-01');
    const [w] = resolveComparison(parsePeriods('la semaine derniere', TODAY), TODAY);
    expect(w.from).toBe('2026-03-16');
    const [d, e] = resolveComparison(parsePeriods('hier', TODAY), TODAY);
    expect(d.from).toBe(TODAY);
    expect(e.from).toBe('2026-03-17');
    const [x, y] = resolveComparison([], TODAY);
    expect(x.label).toBe('ce mois-ci');
    expect(y.label).toBe('le mois dernier');
  });
});
