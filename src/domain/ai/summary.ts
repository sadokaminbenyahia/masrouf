// Propriétaire : agent K — résumé mensuel en français (gabarits variés) + 3 recommandations
import {
  addMonthsYM,
  formatDateFR,
  formatMonthFR,
  monthEnd,
  monthOf,
  monthStart,
  parseISODate,
  type ISODate,
  type YearMonth,
} from '../dates';
import { formatMoney, type Millimes } from '../money';
import { formatPercent } from '../format';
import { savedAmount, savingsRate } from '../savings';
import { capitalize, fnv1a } from './assistant/normalize';
import type {
  AiTransaction,
  AssistantHighlight,
  MonthlySummary,
  MonthlySummaryInput,
  Recommendation,
} from './types';

/** Pourcentages des textes générés : une décimale seulement sous 1 % (« 0,5 % », « 12 % »). */
const PERCENT = { decimals: 'auto' } as const;
const PERCENT_SIGNED = { decimals: 'auto', signed: true } as const;

type FactType =
  'TOTAL' | 'VS_PREV' | 'VS_AVG' | 'TOP_CATS' | 'SPIKE' | 'SAVINGS' | 'BUDGETS' | 'GOALS';

interface Fact {
  type: FactType;
  interest: number;
  text: string;
}

type Templates<V> = readonly ((v: V) => string)[];

/** Choix déterministe d'un gabarit : hash(seed + mois + type) % k. */
export function pickTemplate<V>(
  templates: Templates<V>,
  seed: string,
  month: YearMonth,
  key: string,
  vars: V,
): string {
  const fn = templates[fnv1a(`${seed}|${month}|${key}`) % templates.length];
  return fn ? fn(vars) : '';
}

const m = (v: Millimes) => formatMoney(v, { decimals: 0 });

function startsWithVowel(s: string): boolean {
  return /^[aeiouyéèêâàîôûh]/i.test(s);
}

/** « d'octobre 2026 » / « de mars 2026 » */
function deMonth(ym: YearMonth): string {
  const label = formatMonthFR(ym);
  return startsWithVowel(label) ? `d'${label}` : `de ${label}`;
}

function joinFr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1] ?? ''}`;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const hi = s[mid] ?? 0;
  return s.length % 2 === 1 ? hi : ((s[mid - 1] ?? hi) + hi) / 2;
}

function txHref(categoryId: string | null, month: YearMonth): string {
  const parts = [`from=${monthStart(month)}`, `to=${monthEnd(month)}`, 'type=EXPENSE'];
  if (categoryId) parts.unshift(`categoryId=${encodeURIComponent(categoryId)}`);
  return `/transactions?${parts.join('&')}`;
}

// ───────────────────────── Gabarits ─────────────────────────

interface TotalVars {
  P: string;
  exp: string;
  inc: string;
  de: string;
}
const TOTAL_T: Templates<TotalVars> = [
  (v) => `${v.P}, vous avez dépensé ${v.exp} pour ${v.inc} de revenus.`,
  (v) => `${v.P}, ${v.exp} sont sortis de vos comptes et ${v.inc} y sont entrés.`,
  (v) => `Bilan ${v.de} : ${v.exp} de dépenses face à ${v.inc} de revenus.`,
  (v) => `${v.P}, vos dépenses atteignent ${v.exp}, pour ${v.inc} de rentrées d'argent.`,
];
const TOTAL_NO_INCOME_T: Templates<TotalVars> = [
  (v) => `${v.P}, vous avez dépensé ${v.exp}, sans revenu enregistré.`,
  (v) => `${v.P}, ${v.exp} sont sortis de vos comptes ; aucun revenu n'a été saisi.`,
  (v) => `Bilan ${v.de} : ${v.exp} de dépenses, et pas encore de revenu enregistré.`,
];

interface DeltaVars {
  pct: string;
  ref: string;
  than: string;
  rel: string;
}
const PREV_UP_T: Templates<DeltaVars> = [
  (v) => `C'est ${v.pct} de plus ${v.than} (${v.ref}).`,
  (v) => `Vos dépenses progressent de ${v.pct} par rapport ${v.rel} (${v.ref}).`,
  (v) => `La hausse atteint ${v.pct} comparé ${v.rel} (${v.ref}).`,
];
const PREV_DOWN_T: Templates<DeltaVars> = [
  (v) => `C'est ${v.pct} de moins ${v.than} (${v.ref}), bien joué.`,
  (v) => `Vos dépenses reculent de ${v.pct} par rapport ${v.rel} (${v.ref}).`,
  (v) => `Belle évolution : ${v.pct} de dépenses en moins comparé ${v.rel} (${v.ref}).`,
];
const PREV_STABLE_T: Templates<DeltaVars> = [
  (v) =>
    `Un niveau très proche ${v.rel === 'au mois précédent' ? 'du mois précédent' : 'de la même date le mois dernier'} (${v.ref}).`,
  (v) => `Vos dépenses restent stables par rapport ${v.rel} (${v.ref}).`,
  (v) => `Peu de changement comparé ${v.rel} (${v.ref}) : votre rythme est régulier.`,
];

interface AvgVars {
  pct: string;
  avg: string;
}
const AVG_UP_T: Templates<AvgVars> = [
  (v) => `Vous êtes ${v.pct} au-dessus de votre moyenne des 3 derniers mois (${v.avg}).`,
  (v) => `Ce mois dépasse de ${v.pct} votre moyenne récente de ${v.avg}.`,
  (v) => `Comparé à votre moyenne sur 3 mois (${v.avg}), c'est ${v.pct} de plus.`,
];
const AVG_DOWN_T: Templates<AvgVars> = [
  (v) => `Vous êtes ${v.pct} sous votre moyenne des 3 derniers mois (${v.avg}).`,
  (v) => `Ce mois reste ${v.pct} en dessous de votre moyenne récente de ${v.avg}.`,
  (v) => `Comparé à votre moyenne sur 3 mois (${v.avg}), c'est ${v.pct} de moins : bravo.`,
];

const TOP_T: Templates<{ list: string }> = [
  (v) => `Vos principaux postes : ${v.list}.`,
  (v) => `L'essentiel de vos dépenses est allé à ${v.list}.`,
  (v) => `Le podium des dépenses : ${v.list}.`,
  (v) => `Côté catégories, ${v.list} arrivent en tête.`,
];

interface SpikeVars {
  name: string;
  pct: string;
  amount: string;
  avg: string;
}
const SPIKE_T: Templates<SpikeVars> = [
  (v) =>
    `${v.name} a augmenté de ${v.pct} par rapport à votre moyenne (${v.amount} contre ${v.avg}).`,
  (v) => `Hausse notable en ${v.name} : ${v.amount}, soit ${v.pct} de plus que d'habitude.`,
  (v) =>
    `Le poste ${v.name} grimpe à ${v.amount}, ${v.pct} au-dessus de votre moyenne de ${v.avg}.`,
];

interface SavingVars {
  pct: string;
  saved: string;
  /** « ce mois-ci » pour le mois en cours, sinon « en octobre » */
  when: string;
}
const SAVE_GOOD_T: Templates<SavingVars> = [
  (v) => `Vous avez épargné ${v.saved}, soit ${v.pct} de vos revenus : bravo.`,
  (v) => `Taux d'épargne de ${v.pct} (${v.saved} mis de côté), au-dessus du repère de 20 %.`,
  (v) => `Belle maîtrise : ${v.pct} de vos revenus ont été épargnés, soit ${v.saved}.`,
];
const SAVE_MID_T: Templates<SavingVars> = [
  (v) => `Votre taux d'épargne est de ${v.pct} (${v.saved}) ; le repère conseillé est de 20 %.`,
  (v) => `Vous avez mis de côté ${v.saved}, soit ${v.pct} de vos revenus.`,
  (v) => `${capitalize(v.saved)} épargnés, soit un taux de ${v.pct}.`,
];
const SAVE_NEG_T: Templates<SavingVars> = [
  (v) => `Vos dépenses ont dépassé vos revenus de ${v.saved}.`,
  (v) => `Le mois se solde par un déficit de ${v.saved} : rien d'inquiétant s'il reste ponctuel.`,
  (v) => `Vous avez puisé ${v.saved} dans vos réserves ${v.when}.`,
];

const BUDGET_OVER_T: Templates<{ list: string; n: number }> = [
  (v) => `${v.n > 1 ? `${v.n} budgets dépassés` : 'Un budget dépassé'} : ${v.list}.`,
  (v) =>
    `Attention ${v.n > 1 ? 'aux budgets' : 'au budget'} ${v.list}, passé${v.n > 1 ? 's' : ''} au-dessus du plafond.`,
  (v) => `Petit dépassement côté ${v.list}.`,
];
const BUDGET_OK_T: Templates<{ n: number }> = [
  () => 'Tous vos budgets ont été respectés.',
  (v) =>
    `${v.n > 1 ? `Vos ${v.n} budgets sont restés` : 'Votre budget est resté'} sous le plafond, bravo.`,
  () => 'Aucun dépassement de budget à signaler.',
];

interface GoalVars {
  name: string;
  pct: string;
  saved: string;
  target: string;
}
const GOAL_DONE_T: Templates<GoalVars> = [
  (v) => `Objectif « ${v.name} » atteint, félicitations !`,
  (v) => `Bonne nouvelle : « ${v.name} » est entièrement financé (${v.target}).`,
  (v) => `Vous avez atteint votre objectif « ${v.name} », bravo.`,
];
const GOAL_PROGRESS_T: Templates<GoalVars> = [
  (v) => `Votre objectif « ${v.name} » avance : ${v.pct} atteints (${v.saved} sur ${v.target}).`,
  (v) => `« ${v.name} » en est à ${v.pct} de sa cible de ${v.target}.`,
  (v) => `Côté objectifs, « ${v.name} » est rempli à ${v.pct}.`,
];

const TITLE_T: Templates<{ month: string; de: string }> = [
  (v) => `Votre bilan ${v.de}`,
  (v) => `${capitalize(v.month)} en un coup d'œil`,
  (v) => `Retour sur ${v.month}`,
];
const TITLE_PARTIAL_T: Templates<{ month: string; de: string }> = [
  (v) => `${capitalize(v.month)} : point d'étape`,
  (v) => `Votre mois ${v.de}, jusqu'ici`,
  (v) => `${capitalize(v.month)} en cours`,
];

// ───────────────────────── Calculs ─────────────────────────

interface CatStat {
  total: Millimes;
  count: number;
}

function byCategory(txs: readonly AiTransaction[]): Map<string | null, CatStat> {
  const map = new Map<string | null, CatStat>();
  for (const t of txs) {
    const cur = map.get(t.categoryId) ?? { total: 0, count: 0 };
    map.set(t.categoryId, { total: cur.total + t.amount, count: cur.count + 1 });
  }
  return map;
}

function seriesKey(t: AiTransaction): string {
  if (t.recurringId) return `r:${t.recurringId}`;
  return `l:${t.label
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()}`;
}

interface Candidate extends Recommendation {
  type: string;
  categoryId: string | null;
  /** Gain mensuel estimé pour le tri */
  gain: number;
}

export function generateMonthlySummary(input: MonthlySummaryInput): MonthlySummary {
  const { month, today, seed } = input;
  const partial = month === monthOf(today);
  const todayDay = parseISODate(today).day;
  const prevMonths = [1, 2, 3].map((k) => addMonthsYM(month, -k));
  const flows = input.transactions.filter((t) => t.type !== 'TRANSFER');
  const inMonth = (ym: YearMonth) => flows.filter((t) => monthOf(t.date) === ym);
  const cur = inMonth(month);
  const curExp = cur.filter((t) => t.type === 'EXPENSE');
  const expense = curExp.reduce((s, t) => s + t.amount, 0);
  const income = cur.filter((t) => t.type === 'INCOME').reduce((s, t) => s + t.amount, 0);
  const catName = new Map(input.categories.map((c) => [c.id, c.name]));
  const nameOf = (id: string | null) =>
    id ? (catName.get(id) ?? 'Sans catégorie') : 'Sans catégorie';
  const monthLabel = formatMonthFR(month);
  const titleVars = { month: monthLabel, de: deMonth(month) };
  const title = pickTemplate(partial ? TITLE_PARTIAL_T : TITLE_T, seed, month, 'TITLE', titleVars);

  if (cur.length === 0) {
    return {
      month,
      title,
      paragraphs: [
        `Aucune transaction n'a encore été enregistrée ${partial ? 'ce mois-ci' : `en ${monthLabel}`}. Ajoutez vos dépenses ou importez un relevé bancaire : votre bilan apparaîtra ici.`,
      ],
      highlights: [],
      recommendations: [
        {
          title: 'Importer un relevé',
          detail:
            'Importez le fichier CSV de votre banque : vos transactions seront catégorisées automatiquement.',
          impact: null,
          href: '/import',
        },
      ],
    };
  }

  const facts: Fact[] = [];
  const P = partial ? `Depuis le 1er ${formatMonthFR(month, 'monthOnly')}` : `En ${monthLabel}`;
  facts.push({
    type: 'TOTAL',
    interest: Number.POSITIVE_INFINITY,
    text: pickTemplate(income > 0 ? TOTAL_T : TOTAL_NO_INCOME_T, seed, month, 'TOTAL', {
      P,
      exp: m(expense),
      inc: m(income),
      de: deMonth(month),
    }),
  });

  // Comparaison avec le mois précédent (à date si le mois est en cours).
  const prevExpTx = inMonth(prevMonths[0] ?? month).filter(
    (t) => t.type === 'EXPENSE' && (!partial || parseISODate(t.date).day <= todayDay),
  );
  const prevExpense = prevExpTx.reduce((s, t) => s + t.amount, 0);
  let prevDelta: number | null = null;
  if (prevExpense > 0) {
    const d = (expense - prevExpense) / prevExpense;
    prevDelta = d;
    const vars: DeltaVars = {
      pct: formatPercent(Math.abs(d), PERCENT),
      ref: m(prevExpense),
      than: partial ? "qu'à la même date le mois dernier" : 'que le mois précédent',
      rel: partial ? 'à la même date du mois dernier' : 'au mois précédent',
    };
    const set = Math.abs(d) < 0.03 ? PREV_STABLE_T : d > 0 ? PREV_UP_T : PREV_DOWN_T;
    facts.push({
      type: 'VS_PREV',
      interest: Math.abs(d) * expense,
      text: pickTemplate(set, seed, month, 'VS_PREV', vars),
    });
  }

  // Moyenne des 3 mois précédents (mois terminés uniquement).
  const prevTotals = prevMonths
    .map((ym) => inMonth(ym))
    .filter((txs) => txs.length > 0)
    .map((txs) => txs.filter((t) => t.type === 'EXPENSE').reduce((s, t) => s + t.amount, 0));
  const avg3 =
    prevTotals.length > 0 ? prevTotals.reduce((s, x) => s + x, 0) / prevTotals.length : 0;
  if (!partial && avg3 > 0 && prevTotals.length >= 2) {
    const d = (expense - avg3) / avg3;
    if (Math.abs(d) >= 0.05) {
      facts.push({
        type: 'VS_AVG',
        interest: Math.abs(d) * expense * 0.8,
        text: pickTemplate(d > 0 ? AVG_UP_T : AVG_DOWN_T, seed, month, 'VS_AVG', {
          pct: formatPercent(Math.abs(d), PERCENT),
          avg: m(Math.round(avg3)),
        }),
      });
    }
  }

  // Top 3 des catégories.
  const curCats = [...byCategory(curExp)].sort((a, b) => b[1].total - a[1].total);
  if (curCats.length > 0 && expense > 0) {
    const list = curCats.slice(0, 3).map(([id, s]) => `${nameOf(id)} (${m(s.total)})`);
    facts.push({
      type: 'TOP_CATS',
      interest: expense * 0.15,
      text: pickTemplate(TOP_T, seed, month, 'TOP_CATS', { list: joinFr(list) }),
    });
  }

  // Moyenne par catégorie sur les mois précédents ayant des données.
  const prevMonthsWithData = prevMonths.filter((ym) => inMonth(ym).length > 0);
  const prevCatAvg = new Map<string | null, number>();
  if (prevMonthsWithData.length > 0) {
    const prevExp = prevMonthsWithData.flatMap((ym) =>
      inMonth(ym).filter((t) => t.type === 'EXPENSE'),
    );
    for (const [id, s] of byCategory(prevExp)) {
      prevCatAvg.set(id, s.total / prevMonthsWithData.length);
    }
  }

  // Dépense habituelle des mois ACTIFS de chaque catégorie sur les 6 mois précédents : une
  // facture bimestrielle ou trimestrielle n'est pas une « hausse » le mois où elle tombe.
  const activeAvg = new Map<string | null, number>();
  {
    const prev6 = [1, 2, 3, 4, 5, 6].map((k) => addMonthsYM(month, -k));
    const perMonth = new Map<string | null, number[]>();
    for (const ym of prev6) {
      for (const [id, s] of byCategory(inMonth(ym).filter((t) => t.type === 'EXPENSE'))) {
        perMonth.set(id, [...(perMonth.get(id) ?? []), s.total]);
      }
    }
    for (const [id, totals] of perMonth) {
      activeAvg.set(id, totals.reduce((a, b) => a + b, 0) / totals.length);
    }
  }

  // Plus forte hausse (hors factures périodiques non mensuelles : voir `activeAvg`).
  let spike: { id: string | null; amount: number; avg: number; d: number } | null = null;
  for (const [id, s] of curCats) {
    const avg = prevCatAvg.get(id) ?? 0;
    if (avg <= 0) continue;
    const active = activeAvg.get(id) ?? avg;
    if (s.total < active * 1.15) continue;
    const d = (s.total - avg) / avg;
    if (d >= 0.15 && s.total - avg >= 10_000 && (!spike || d * s.total > spike.d * spike.amount)) {
      spike = { id, amount: s.total, avg, d };
    }
  }
  if (spike) {
    facts.push({
      type: 'SPIKE',
      interest: spike.d * spike.amount,
      text: pickTemplate(SPIKE_T, seed, month, 'SPIKE', {
        name: nameOf(spike.id),
        pct: formatPercent(spike.d, PERCENT),
        amount: m(spike.amount),
        avg: m(Math.round(spike.avg)),
      }),
    });
  }

  // Taux d'épargne (définition unique : les versements vers le groupe Épargne sont de l'épargne).
  const savingsIds = new Set(
    input.categories.filter((c) => c.group === 'SAVINGS').map((c) => c.id),
  );
  const totals = {
    income,
    expense,
    savingsGroupExpense: curExp
      .filter((t) => t.categoryId !== null && savingsIds.has(t.categoryId))
      .reduce((s, t) => s + t.amount, 0),
  };
  const saved = savedAmount(totals);
  const rate = savingsRate(totals);
  if (rate !== null) {
    const set = rate < 0 ? SAVE_NEG_T : rate >= 0.2 ? SAVE_GOOD_T : SAVE_MID_T;
    facts.push({
      type: 'SAVINGS',
      interest: income * (0.1 + Math.abs(rate - 0.2) * 0.5),
      text: pickTemplate(set, seed, month, 'SAVINGS', {
        pct: formatPercent(Math.abs(rate), PERCENT),
        saved: m(Math.abs(saved)),
        when: monthWhen(month, input.today),
      }),
    });
  }

  // Budgets.
  const exceeded = input.budgets.filter((b) => b.level === 'EXCEEDED');
  if (exceeded.length > 0) {
    const overrun = exceeded.reduce((s, b) => s + (b.spent - b.budget.amount), 0);
    facts.push({
      type: 'BUDGETS',
      interest: overrun * 2 + expense * 0.1,
      text: pickTemplate(BUDGET_OVER_T, seed, month, 'BUDGETS', {
        n: exceeded.length,
        list: joinFr(exceeded.map((b) => `${b.category.name} (+${m(b.spent - b.budget.amount)})`)),
      }),
    });
  } else if (input.budgets.length > 0) {
    facts.push({
      type: 'BUDGETS',
      interest: expense * 0.05,
      text: pickTemplate(BUDGET_OK_T, seed, month, 'BUDGETS', { n: input.budgets.length }),
    });
  }

  // Objectifs.
  const completed = input.goals.find((g) => g.status === 'COMPLETED');
  const progressing = [...input.goals]
    .filter((g) => g.status !== 'COMPLETED' && g.savedAmount > 0)
    .sort((a, b) => b.ratio - a.ratio)[0];
  const goalForFact = completed ?? progressing;
  if (goalForFact) {
    facts.push({
      type: 'GOALS',
      interest: expense * (completed ? 0.25 : 0.04),
      text: pickTemplate(completed ? GOAL_DONE_T : GOAL_PROGRESS_T, seed, month, 'GOALS', {
        name: goalForFact.name,
        pct: formatPercent(Math.min(1, goalForFact.ratio), PERCENT),
        saved: m(goalForFact.savedAmount),
        target: m(goalForFact.targetAmount),
      }),
    });
  }

  // Sélection : le total, puis les 4 faits les plus intéressants.
  const [total, ...others] = facts;
  const ranked = others.sort((a, b) => b.interest - a.interest).slice(0, 4);
  const comparison = ranked.find((f) => f.type === 'VS_PREV' || f.type === 'VS_AVG');
  const rest = ranked.filter((f) => f !== comparison);
  const paragraphs: string[] = [
    [total?.text ?? '', comparison?.text ?? ''].filter(Boolean).join(' '),
  ];
  for (let i = 0; i < rest.length; i += 2) {
    paragraphs.push(
      rest
        .slice(i, i + 2)
        .map((f) => f.text)
        .join(' '),
    );
  }

  const highlights: AssistantHighlight[] = [
    { label: 'Dépenses', value: expense, format: 'money' },
    { label: 'Revenus', value: income, format: 'money' },
  ];
  if (rate !== null) highlights.push({ label: "Taux d'épargne", value: rate, format: 'percent' });
  if (prevDelta !== null) {
    highlights.push({ label: 'Évolution des dépenses', value: prevDelta, format: 'percent' });
  }

  return {
    month,
    title,
    paragraphs,
    highlights,
    recommendations: buildRecommendations({
      input,
      curExp,
      curCats,
      prevCatAvg,
      activeAvg,
      income,
      saved,
      rate,
      nameOf,
    }),
  };
}

/** « ce mois-ci » pour le mois en cours, sinon « en octobre » (mois résumé). */
function monthWhen(month: YearMonth, today: ISODate): string {
  return monthOf(today) === month ? 'ce mois-ci' : `en ${formatMonthFR(month, 'monthOnly')}`;
}

function buildRecommendations(p: {
  input: MonthlySummaryInput;
  curExp: AiTransaction[];
  curCats: [string | null, CatStat][];
  prevCatAvg: Map<string | null, number>;
  income: Millimes;
  saved: Millimes;
  rate: number | null;
  nameOf: (id: string | null) => string;
  /** Dépense habituelle des mois actifs (6 mois) par catégorie */
  activeAvg: Map<string | null, number>;
}): Recommendation[] {
  const { input, curExp, curCats, prevCatAvg, nameOf, activeAvg } = p;
  const month = input.month;
  const when = monthWhen(month, input.today);
  const main: Candidate[] = [];

  // 1. Catégorie au-dessus de son budget.
  for (const b of input.budgets) {
    if (b.level !== 'EXCEEDED') continue;
    const gain = b.spent - b.budget.amount;
    if (gain <= 0) continue;
    main.push({
      type: 'BUDGET_OVER',
      categoryId: b.category.id,
      gain,
      impact: gain,
      title: `Ramener ${b.category.name} sous son budget`,
      detail: `${m(b.spent)} dépensés pour un plafond de ${m(b.budget.amount)}. Revenir au plafond libérerait ${m(gain)} par mois.`,
      href: txHref(b.category.id, month),
    });
  }

  // 2. Catégorie en hausse de plus de 30 %.
  for (const [id, s] of curCats) {
    const avg = prevCatAvg.get(id) ?? 0;
    if (avg <= 0) continue;
    const gain = Math.round(s.total - avg);
    const active = activeAvg.get(id) ?? avg;
    if (s.total > avg * 1.3 && s.total > active * 1.3 && gain >= 30_000) {
      main.push({
        type: 'CATEGORY_SPIKE',
        categoryId: id,
        gain,
        impact: gain,
        title: `Freiner la hausse en ${nameOf(id)}`,
        detail: `${m(s.total)} ${when} contre ${m(Math.round(avg))} en moyenne (${formatPercent((s.total - avg) / avg, PERCENT_SIGNED)}). Revenir à votre niveau habituel ferait gagner ${m(gain)}.`,
        href: txHref(id, month),
      });
    }
  }

  // 3. Petites dépenses fréquentes (cafés…).
  const small = byCategory(curExp.filter((t) => t.amount <= 15_000));
  let bestSmall: [string | null, CatStat] | null = null;
  for (const entry of small) {
    if (entry[1].count >= 6 && (!bestSmall || entry[1].total > bestSmall[1].total))
      bestSmall = entry;
  }
  if (bestSmall) {
    const [id, s] = bestSmall;
    const gain = Math.round(s.total / 3);
    main.push({
      type: 'SMALL_FREQUENT',
      categoryId: id,
      gain,
      impact: gain,
      title: `Vos petites dépenses en ${nameOf(id)}`,
      detail: `${s.count} achats de ${m(Math.round(s.total / s.count))} en moyenne, soit ${m(s.total)} ${when}. En supprimer un sur trois vous ferait économiser environ ${m(gain)} par mois.`,
      href: txHref(id, month),
    });
  }

  // 4. Abonnement en hausse : une échéance par mois, dernier montant > médiane × 1,05.
  const series = new Map<string, AiTransaction[]>();
  for (const t of input.transactions) {
    if (t.type !== 'EXPENSE') continue;
    const k = seriesKey(t);
    series.set(k, [...(series.get(k) ?? []), t]);
  }
  let bestSub: Candidate | null = null;
  for (const txs of series.values()) {
    const perMonth = new Map<string, AiTransaction[]>();
    for (const t of txs)
      perMonth.set(monthOf(t.date), [...(perMonth.get(monthOf(t.date)) ?? []), t]);
    if (perMonth.size < 3 || [...perMonth.values()].some((l) => l.length !== 1)) continue;
    const sorted = [...txs].sort((a, b) => (a.date < b.date ? -1 : 1));
    const last = sorted[sorted.length - 1];
    if (!last || monthOf(last.date) !== month) continue;
    const prev = sorted.slice(-4, -1).map((t) => t.amount);
    const med = median(prev);
    const gain = Math.round(last.amount - med);
    if (last.amount > med * 1.05 && gain >= 1_000 && (!bestSub || gain > bestSub.gain)) {
      bestSub = {
        type: 'SUBSCRIPTION_INCREASE',
        categoryId: last.categoryId,
        gain,
        impact: gain,
        title: `Hausse de « ${last.label} »`,
        detail: `Le montant est passé de ${m(Math.round(med))} à ${formatMoney(last.amount)}. Vérifiez votre offre ou comparez la concurrence : ${m(gain)} par mois à la clé.`,
        href: '/recurrents',
      };
    }
  }
  if (bestSub) main.push(bestSub);

  // 5. Taux d'épargne inférieur à 10 %.
  if (p.rate !== null && p.rate < 0.1) {
    const gain = Math.round(0.1 * p.income - p.saved);
    main.push({
      type: 'LOW_SAVINGS',
      categoryId: null,
      gain,
      impact: gain,
      title: "Viser 10 % d'épargne",
      detail: `Mettre de côté ${m(gain)} de plus par mois vous amènerait à 10 % de vos revenus. Un virement automatique en début de mois aide beaucoup.`,
      href: '/objectifs',
    });
  }

  // 6. Objectif en retard.
  const late = input.goals
    .filter((g) => g.status === 'AT_RISK' || g.status === 'OVERDUE')
    .sort((a, b) => (b.monthlyNeeded ?? 0) - (a.monthlyNeeded ?? 0))[0];
  if (late) {
    main.push({
      type: 'GOAL_LATE',
      categoryId: null,
      gain: late.monthlyNeeded ?? 0,
      impact: late.monthlyNeeded,
      title: `Remettre « ${late.name} » sur les rails`,
      detail:
        late.monthlyNeeded !== null && late.targetDate
          ? `Il faudrait y consacrer ${m(late.monthlyNeeded)} par mois pour tenir l'échéance du ${formatDateFR(late.targetDate)}. Ajustez le montant ou la date si besoin.`
          : 'Cet objectif a pris du retard : ajustez sa date ou programmez un versement mensuel.',
      href: '/objectifs',
    });
  }

  const chosen: Candidate[] = [];
  const pick = (list: Candidate[]) => {
    for (const c of [...list].sort((a, b) => b.gain - a.gain)) {
      if (chosen.length >= 3) return;
      if (chosen.some((x) => x.type === c.type)) continue;
      if (c.categoryId !== null && chosen.some((x) => x.categoryId === c.categoryId)) continue;
      chosen.push(c);
    }
  };
  pick(main);

  // Replis : poste variable principal, catégorie sans budget. Chacun parcourt TOUTES les
  // catégories éligibles et retient la première qui n'est pas déjà couverte par une
  // recommandation, pour garantir 3 recommandations quand les données le permettent.
  const taken = (id: string | null) => id !== null && chosen.some((x) => x.categoryId === id);
  const fallback: Candidate[] = [];
  const topVar = curCats.find(([id, s]) => s.count >= 3 && !taken(id));
  const isFirstVar = topVar !== undefined && topVar === curCats.find(([, s]) => s.count >= 3);
  if (topVar) {
    const [id, s] = topVar;
    const gain = Math.round(s.total * 0.1);
    fallback.push({
      type: 'TRIM_VARIABLE',
      categoryId: id,
      gain,
      impact: gain,
      title: `Réduire ${nameOf(id)} de 10 %`,
      detail: `C'est ${isFirstVar ? 'votre premier poste' : 'un de vos principaux postes'} de dépenses courantes (${m(s.total)}). Une baisse de 10 % représente ${m(gain)} par mois.`,
      href: txHref(id, month),
    });
  }
  const budgeted = new Set(input.budgets.map((b) => b.category.id));
  const unbudgeted = curCats.find(
    ([id, s]) =>
      id !== null && s.count >= 2 && !budgeted.has(id) && !taken(id) && id !== topVar?.[0],
  );
  if (unbudgeted) {
    const [id, s] = unbudgeted;
    const gain = Math.round(s.total * 0.1);
    fallback.push({
      type: 'SET_BUDGET',
      categoryId: id,
      gain,
      impact: gain,
      title: `Fixer un budget ${nameOf(id)}`,
      detail: `Vous y avez consacré ${m(s.total)} sans plafond défini. Un budget de ${m(s.total - gain)} vous ferait économiser ${m(gain)} par mois.`,
      href: '/budgets',
    });
  }
  pick(fallback);
  return chosen.map(({ title, detail, impact, href }) => ({ title, detail, impact, href }));
}
