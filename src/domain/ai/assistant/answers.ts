/**
 * Une fonction par intention : appelle les FinanceTools, puis rédige la réponse en français.
 * Règle d'or : aucun chiffre inventé, tous les montants proviennent des outils.
 */
import {
  addDays,
  addMonthsYM,
  diffDays,
  formatDateFR,
  formatMonthFR,
  isInRange,
  monthEnd,
  monthOf,
  monthStart,
  type DateRange,
  type ISODate,
  type YearMonth,
} from '../../dates';
import { formatMoney, type Millimes } from '../../money';
import type { Frequency, RecurringRule } from '../../types';
import { simulateWhatIf } from '../simulator';
import type {
  AiCategory,
  AssistantAnswer,
  AssistantContext,
  AssistantHighlight,
  AssistantIntent,
  FinanceTools,
  MiniChart,
  ToolFilter,
} from '../types';
import { matchGoal } from './entities';
import type { KnownIntent } from './intents';
import { capitalize, formatPercent } from './normalize';
import {
  defaultPeriod,
  labelForRange,
  monthsCovered,
  previousPeriod,
  type ParsedPeriod,
} from './periods';

export interface AnswerInput {
  /** Question normalisée */
  norm: string;
  today: ISODate;
  ctx: AssistantContext;
  tools: FinanceTools;
  /** Période principale (par défaut ce mois) */
  period: ParsedPeriod;
  /** Toutes les périodes explicitement citées */
  periods: ParsedPeriod[];
  /** Catégorie de dépense reconnue */
  expenseCategory: AiCategory | null;
  /** Catégorie de revenu reconnue */
  incomeCategory: AiCategory | null;
  amount: Millimes | null;
}

type Answerer = (input: AnswerInput) => Promise<AssistantAnswer>;

// ───────────────────────── Utilitaires ─────────────────────────

export function buildTransactionsHref(params: {
  categoryId?: string | null;
  from?: ISODate;
  to?: ISODate;
  type?: 'EXPENSE' | 'INCOME';
  q?: string;
}): string {
  const parts: string[] = [];
  const add = (k: string, v: string | null | undefined) => {
    if (v) parts.push(`${k}=${encodeURIComponent(v)}`);
  };
  add('categoryId', params.categoryId);
  add('from', params.from);
  add('to', params.to);
  add('type', params.type);
  add('q', params.q);
  return parts.length > 0 ? `/transactions?${parts.join('&')}` : '/transactions';
}

function periodOut(p: DateRange & { label: string }): AssistantAnswer['period'] {
  return { from: p.from, to: p.to, label: p.label };
}

/** « les 3 derniers mois » → « sur les 3 derniers mois » ; sinon inchangé. */
export function inPeriod(label: string): string {
  return label.startsWith('les ') ? `sur ${label}` : label;
}

function money(label: string, value: Millimes): AssistantHighlight {
  return { label, value, format: 'money' };
}
function percent(label: string, value: number): AssistantHighlight {
  return { label, value, format: 'percent' };
}
function count(label: string, value: number): AssistantHighlight {
  return { label, value, format: 'number' };
}

function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

export function joinFr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} et ${items[items.length - 1] ?? ''}`;
}

function shortLabel(s: string, max = 22): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function isPast(p: DateRange, today: ISODate): boolean {
  return p.to < today;
}

function base(
  intent: AssistantIntent,
  text: string,
  extra: Partial<Omit<AssistantAnswer, 'intent' | 'text' | 'understood'>> = {},
): AssistantAnswer {
  return {
    intent,
    understood: true,
    text,
    highlights: extra.highlights ?? [],
    chart: extra.chart ?? null,
    suggestions: extra.suggestions ?? [],
    period: extra.period ?? null,
    href: extra.href ?? null,
  };
}

/** Mois à afficher dans un graphique mensuel pour une période. */
function chartRange(p: DateRange, today: ISODate): DateRange {
  const end = isInRange(today, p) ? today : p.to;
  const endMonth = monthOf(end);
  if (monthsCovered({ from: p.from, to: end }) >= 2) {
    const first = monthOf(p.from);
    const minFirst = addMonthsYM(endMonth, -11);
    return { from: monthStart(first > minFirst ? first : minFirst), to: monthEnd(endMonth) };
  }
  return { from: monthStart(addMonthsYM(endMonth, -5)), to: monthEnd(endMonth) };
}

function categoryFilter(cat: AiCategory | null): Pick<ToolFilter, 'categoryIds'> {
  return cat ? { categoryIds: [cat.id] } : {};
}

/** Les `n` derniers mois complets (avant le mois de `today`). */
function lastCompleteMonths(today: ISODate, n: number): YearMonth[] {
  const cur = monthOf(today);
  const out: YearMonth[] = [];
  for (let i = n; i >= 1; i--) out.push(addMonthsYM(cur, -i));
  return out;
}

const FREQUENCY_LABEL: Record<Frequency, string> = {
  WEEKLY: 'par semaine',
  MONTHLY: 'par mois',
  QUARTERLY: 'par trimestre',
  YEARLY: 'par an',
};

/** Équivalent mensuel d'une récurrence. */
export function monthlyEquivalent(r: Pick<RecurringRule, 'amount' | 'frequency'>): Millimes {
  switch (r.frequency) {
    case 'WEEKLY':
      return Math.round((r.amount * 52) / 12);
    case 'MONTHLY':
      return r.amount;
    case 'QUARTERLY':
      return Math.round(r.amount / 3);
    case 'YEARLY':
      return Math.round(r.amount / 12);
  }
}

// ───────────────────────── Réponses ─────────────────────────

const spendingTotal: Answerer = async ({ tools, period, expenseCategory: cat, today }) => {
  const filter: ToolFilter = { range: period, type: 'EXPENSE', ...categoryFilter(cat) };
  const [{ total, count: n }, monthly] = await Promise.all([
    tools.sumTransactions(filter),
    tools.monthlyTotals({ ...filter, range: chartRange(period, today) }),
  ]);
  const what = cat ? ` en ${cat.name}` : '';
  const when = inPeriod(period.label);
  const text =
    n === 0
      ? `Aucune dépense${what} enregistrée ${when}.`
      : `${capitalize(when)}, vous avez dépensé ${formatMoney(total)}${what}, en ${plural(n, 'transaction')}.`;
  const chart: MiniChart | null =
    monthly.length >= 2 && monthly.some((m) => m.expense > 0)
      ? {
          kind: 'bar',
          title: cat ? `Dépenses ${cat.name} par mois` : 'Dépenses par mois',
          data: monthly.map((m) => ({ label: formatMonthFR(m.month, 'short'), value: m.expense })),
        }
      : null;
  return base('SPENDING_TOTAL', text, {
    highlights: [money(cat ? `Dépenses ${cat.name}` : 'Dépenses', total), count('Transactions', n)],
    chart,
    period: periodOut(period),
    href: buildTransactionsHref({
      categoryId: cat?.id,
      from: period.from,
      to: period.to,
      type: 'EXPENSE',
    }),
    suggestions: [
      `Où part mon argent ${period.label} ?`,
      cat
        ? `Combien je dépense en moyenne en ${cat.name.toLowerCase()} ?`
        : 'Est-ce que je dépense plus que le mois dernier ?',
    ],
  });
};

const incomeTotal: Answerer = async ({ tools, period, incomeCategory: cat, today }) => {
  const filter: ToolFilter = { range: period, type: 'INCOME', ...categoryFilter(cat) };
  const [{ total, count: n }, monthly] = await Promise.all([
    tools.sumTransactions(filter),
    tools.monthlyTotals({ ...filter, range: chartRange(period, today) }),
  ]);
  const what = cat ? ` en ${cat.name}` : '';
  const when = inPeriod(period.label);
  const text =
    n === 0
      ? `Aucun revenu${what} enregistré ${when}.`
      : `${capitalize(when)}, vous avez reçu ${formatMoney(total)}${what}, en ${plural(n, 'entrée')} d'argent.`;
  const chart: MiniChart | null =
    monthly.length >= 2 && monthly.some((m) => m.income > 0)
      ? {
          kind: 'bar',
          title: 'Revenus par mois',
          data: monthly.map((m) => ({ label: formatMonthFR(m.month, 'short'), value: m.income })),
        }
      : null;
  return base('INCOME_TOTAL', text, {
    highlights: [money(cat ? `Revenus ${cat.name}` : 'Revenus', total), count('Entrées', n)],
    chart,
    period: periodOut(period),
    href: buildTransactionsHref({
      categoryId: cat?.id,
      from: period.from,
      to: period.to,
      type: 'INCOME',
    }),
    suggestions: [
      `Quel est mon taux d’épargne ${period.label} ?`,
      'Combien j’aurai à la fin du mois ?',
    ],
  });
};

/** Période « courante » de même nature qu'une période passée citée seule. */
function currentLike(p: ParsedPeriod, today: ISODate): ParsedPeriod {
  let range: DateRange;
  switch (p.unit) {
    case 'month':
    case 'quarter':
    case 'year':
    case 'week': {
      // Remonte période par période jusqu'à celle qui contient aujourd'hui.
      let cur: DateRange = { from: p.from, to: p.to };
      let guard = 0;
      while (cur.to < today && guard < 1200) {
        const len = monthsCovered(cur);
        const next =
          p.unit === 'week'
            ? { from: addDays(cur.to, 1), to: addDays(cur.to, 7) }
            : {
                from: monthStart(addMonthsYM(monthOf(cur.from), len)),
                to: monthEnd(addMonthsYM(monthOf(cur.to), len)),
              };
        cur = next;
        guard++;
      }
      range = cur;
      break;
    }
    default: {
      const len = diffDays(p.from, p.to) + 1;
      range = { from: addDays(today, -(len - 1)), to: today };
    }
  }
  return { ...range, unit: p.unit, label: labelForRange(range, today), span: null };
}

export function resolveComparison(
  periods: readonly ParsedPeriod[],
  today: ISODate,
): [ParsedPeriod, ParsedPeriod] {
  const [first, second] = periods;
  if (first && second) return [first, second];
  if (first) {
    if (first.to < today) return [currentLike(first, today), first];
    return [first, previousPeriod(first, today)];
  }
  const cur = defaultPeriod(today);
  return [cur, previousPeriod(cur, today)];
}

const comparePeriods: Answerer = async (input) => {
  const { tools, today, norm } = input;
  const isIncome = /\b(?:gagne|gagner|revenus?|recu|salaires?)\b/.test(norm);
  const type = isIncome ? 'INCOME' : 'EXPENSE';
  const cat = isIncome ? input.incomeCategory : input.expenseCategory;
  const [a, b] = resolveComparison(input.periods, today);

  // Comparaison « à date » si la première période est en cours.
  const ongoing = a.from <= today && today < a.to && b.to < a.from;
  const elapsed = diffDays(a.from, today);
  const aCut: DateRange = ongoing ? { from: a.from, to: today } : a;
  const bCutTo = addDays(b.from, elapsed);
  const bCut: DateRange = ongoing ? { from: b.from, to: bCutTo < b.to ? bCutTo : b.to } : b;
  const filter = (range: DateRange): ToolFilter => ({ range, type, ...categoryFilter(cat) });

  const [sa, sb, sbFull] = await Promise.all([
    tools.sumTransactions(filter(aCut)),
    tools.sumTransactions(filter(bCut)),
    ongoing ? tools.sumTransactions(filter(b)) : Promise.resolve(null),
  ]);
  const A = sa.total;
  const B = sb.total;
  const what = cat ? ` en ${cat.name}` : '';
  const noun = isIncome ? 'revenus' : 'dépenses';
  const verb = isIncome ? 'reçu' : 'dépensé';
  const aLabel = inPeriod(a.label);
  const bLabel = inPeriod(b.label);
  const dateNote = ongoing ? `À date (au ${formatDateFR(today, 'dayMonth')}), ` : '';
  const sameDate = ongoing ? ` à la même date ${bLabel}` : ` ${bLabel}`;

  let text: string;
  let delta: number | null = null;
  if (A === 0 && B === 0) {
    text = `Aucune ${isIncome ? 'entrée' : 'dépense'}${what} ni ${aLabel}, ni ${bLabel} : rien à comparer.`;
  } else if (B === 0) {
    text = `${dateNote}vous avez ${verb} ${formatMoney(A)}${what} ${aLabel}, contre rien${sameDate} : pas de comparaison possible.`;
  } else {
    delta = (A - B) / B;
    const trend =
      Math.abs(delta) < 0.02
        ? `Vos ${noun}${what} sont stables`
        : delta > 0
          ? `Vos ${noun}${what} sont en hausse`
          : `Vos ${noun}${what} sont en baisse`;
    text = `${trend} : ${dateNote ? dateNote.toLowerCase() : ''}${formatMoney(A)} ${aLabel}, contre ${formatMoney(B)}${sameDate} (${formatPercent(delta, true)}).`;
    if (sbFull)
      text += ` Sur l'ensemble de la période précédente, le total était de ${formatMoney(sbFull.total)}.`;
  }
  const highlights: AssistantHighlight[] = [
    money(capitalize(a.label), A),
    money(capitalize(b.label), B),
  ];
  if (delta !== null) highlights.push(percent('Évolution', delta));
  const ordered = b.from <= a.from ? [b, a] : [a, b];
  const values = new Map([
    [a, A],
    [b, B],
  ]);
  return base('COMPARE_PERIODS', text, {
    highlights,
    chart: {
      kind: 'bar',
      title: `${capitalize(noun)}${what} comparées`,
      data: ordered.map((p) => ({ label: capitalize(p.label), value: values.get(p) ?? 0 })),
    },
    period: periodOut(a),
    href: buildTransactionsHref({ categoryId: cat?.id, from: a.from, to: a.to, type }),
    suggestions: [`Où part mon argent ${a.label} ?`, 'Combien j’aurai à la fin du mois ?'],
  });
};

const topCategories: Answerer = async ({ tools, period, today }) => {
  const rows = (await tools.breakdownByCategory({ range: period, type: 'EXPENSE' }))
    .filter((r) => r.total > 0)
    .sort((x, y) => y.total - x.total);
  const total = rows.reduce((s, r) => s + r.total, 0);
  const when = inPeriod(period.label);
  const href = buildTransactionsHref({ from: period.from, to: period.to, type: 'EXPENSE' });
  if (rows.length === 0 || total === 0) {
    return base('TOP_CATEGORIES', `Aucune dépense enregistrée ${when}.`, {
      period: periodOut(period),
      href,
    });
  }
  const top = rows.slice(0, 3);
  const list = top.map(
    (r) => `${r.name} (${formatMoney(r.total)}, ${formatPercent(r.total / total)})`,
  );
  const topShare = top.reduce((s, r) => s + r.total, 0) / total;
  const tense = isPast(period, today) ? 'est surtout parti' : 'part surtout';
  let text = `${capitalize(when)}, votre argent ${tense} en ${joinFr(list)}.`;
  if (rows.length > top.length) {
    text += ` ${top.length === 1 ? 'Ce poste représente' : `Ces ${top.length} postes représentent`} ${formatPercent(topShare)} de vos dépenses (${formatMoney(total)} au total).`;
  } else {
    text += ` Total : ${formatMoney(total)}.`;
  }
  const slices = rows.slice(0, 5).map((r) => ({ label: r.name, value: r.total }));
  const rest = rows.slice(5).reduce((s, r) => s + r.total, 0);
  if (rest > 0) slices.push({ label: 'Autres', value: rest });
  return base('TOP_CATEGORIES', text, {
    highlights: top.map((r) => money(r.name, r.total)),
    chart: { kind: 'pie', title: 'Répartition des dépenses', data: slices },
    period: periodOut(period),
    href,
    suggestions: [
      `Combien j’ai dépensé en ${(top[0]?.name ?? 'courses').toLowerCase()} ${period.label} ?`,
      `Quelles sont mes plus grosses dépenses ${period.label} ?`,
    ],
  });
};

const topMerchants: Answerer = async ({ tools, period, expenseCategory: cat }) => {
  const rows = (
    await tools.topMerchants({ range: period, type: 'EXPENSE', ...categoryFilter(cat), limit: 5 })
  ).filter((r) => r.total > 0);
  const when = inPeriod(period.label);
  const what = cat ? ` en ${cat.name}` : '';
  const href = buildTransactionsHref({
    categoryId: cat?.id,
    from: period.from,
    to: period.to,
    type: 'EXPENSE',
  });
  if (rows.length === 0) {
    return base('TOP_MERCHANTS', `Aucune dépense${what} enregistrée ${when}.`, {
      period: periodOut(period),
      href,
    });
  }
  const list = rows.map((r) => `${r.label} (${formatMoney(r.total)}, ${plural(r.count, 'achat')})`);
  const text = `${capitalize(when)}, vos principaux commerçants${what} sont : ${joinFr(list)}.`;
  return base('TOP_MERCHANTS', text, {
    highlights: rows.slice(0, 2).map((r) => money(r.label, r.total)),
    chart: {
      kind: 'bar',
      title: 'Commerçants principaux',
      data: rows.map((r) => ({ label: shortLabel(r.label), value: r.total })),
    },
    period: periodOut(period),
    href,
    suggestions: [
      `Où part mon argent ${period.label} ?`,
      `Mes plus grosses dépenses ${period.label}`,
    ],
  });
};

const biggestExpense: Answerer = async ({ tools, period, expenseCategory: cat, today }) => {
  const list = await tools.listTransactions({
    range: period,
    type: 'EXPENSE',
    ...categoryFilter(cat),
    sort: 'AMOUNT_DESC',
    limit: 5,
  });
  const when = capitalize(inPeriod(period.label));
  const what = cat ? ` en ${cat.name}` : '';
  const href = buildTransactionsHref({
    categoryId: cat?.id,
    from: period.from,
    to: period.to,
    type: 'EXPENSE',
  });
  const [first, ...others] = list;
  if (!first) {
    return base('BIGGEST_EXPENSE', `${when}, aucune dépense${what} n'a été enregistrée.`, {
      period: periodOut(period),
      href,
    });
  }
  const verb = isPast(period, today) ? 'a été' : 'est';
  let text = `${when}, votre plus grosse dépense${what} ${verb} « ${first.label} » : ${formatMoney(first.amount)}, le ${formatDateFR(first.date, 'dayMonth')}.`;
  if (others.length > 0) {
    text += ` Viennent ensuite ${joinFr(others.map((t) => `« ${t.label} » (${formatMoney(t.amount)})`))}.`;
  }
  return base('BIGGEST_EXPENSE', text, {
    highlights: [money('Plus grosse dépense', first.amount)],
    chart:
      list.length >= 2
        ? {
            kind: 'bar',
            title: 'Plus grosses dépenses',
            data: list.map((t) => ({ label: shortLabel(t.label), value: t.amount })),
          }
        : null,
    period: periodOut(period),
    href,
    suggestions: [`Où part mon argent ${period.label} ?`, 'Quels sont mes plus gros commerçants ?'],
  });
};

const averageSpending: Answerer = async ({
  tools,
  period,
  periods,
  expenseCategory: cat,
  today,
}) => {
  const current = monthOf(today);
  let months: YearMonth[];
  const explicit = periods.length > 0 && monthsCovered(period) >= 2;
  if (explicit) {
    const all: YearMonth[] = [];
    for (let m = monthOf(period.from); m <= monthOf(period.to); m = addMonthsYM(m, 1)) all.push(m);
    const complete = all.filter((m) => m < current);
    months = (complete.length > 0 ? complete : all).slice(-12);
  } else {
    months = lastCompleteMonths(today, 3);
  }
  const firstMonth = months[0] ?? current;
  const lastMonth = months[months.length - 1] ?? current;
  const range: DateRange = { from: monthStart(firstMonth), to: monthEnd(lastMonth) };
  const monthly = (
    await tools.monthlyTotals({ range, type: 'EXPENSE', ...categoryFilter(cat) })
  ).filter((m) => months.includes(m.month));
  const n = months.length;
  const label =
    explicit && n !== 3 ? labelForRange(range, today) : `les ${n} derniers mois complets`;
  const what = cat ? ` en ${cat.name}` : '';
  const sum = monthly.reduce((s, m) => s + m.expense, 0);
  const href = buildTransactionsHref({
    categoryId: cat?.id,
    from: range.from,
    to: range.to,
    type: 'EXPENSE',
  });
  if (sum === 0) {
    return base(
      'AVERAGE_SPENDING',
      `Aucune dépense${what} enregistrée ${inPeriod(label)} : pas de moyenne à calculer.`,
      {
        period: { ...range, label },
        href,
      },
    );
  }
  const avg = Math.round(sum / n);
  const max = monthly.reduce(
    (best, m) => (m.expense > best.expense ? m : best),
    monthly[0] ?? { month: firstMonth, income: 0, expense: 0, net: 0 },
  );
  const span =
    n === 1
      ? formatMonthFR(firstMonth)
      : `de ${formatMonthFR(firstMonth)} à ${formatMonthFR(lastMonth)}`;
  let text = `En moyenne, vous dépensez ${formatMoney(avg)} par mois${what} (calcul sur ${plural(n, 'mois', 'mois')}, ${span}).`;
  if (n >= 2)
    text += ` Le mois le plus élevé : ${formatMonthFR(max.month)}, avec ${formatMoney(max.expense)}.`;
  return base('AVERAGE_SPENDING', text, {
    highlights: [money('Moyenne mensuelle', avg), money('Mois le plus élevé', max.expense)],
    chart:
      monthly.length >= 2
        ? {
            kind: 'bar',
            title: cat ? `Dépenses ${cat.name} par mois` : 'Dépenses par mois',
            data: monthly.map((m) => ({
              label: formatMonthFR(m.month, 'short'),
              value: m.expense,
            })),
          }
        : null,
    period: { ...range, label },
    href,
    suggestions: [
      cat
        ? `Il me reste combien dans mon budget ${cat.name.toLowerCase()} ?`
        : 'Où part mon argent ce mois-ci ?',
      'Est-ce que je dépense plus que le mois dernier ?',
    ],
  });
};

const budgetStatus: Answerer = async ({ tools, period, periods, expenseCategory: cat, today }) => {
  const month =
    periods.length > 0 && monthsCovered(period) === 1 ? monthOf(period.from) : monthOf(today);
  const range: DateRange = { from: monthStart(month), to: monthEnd(month) };
  const label = labelForRange(range, today);
  const outPeriod = { ...range, label };
  const href = buildTransactionsHref({
    categoryId: cat?.id,
    from: range.from,
    to: range.to,
    type: 'EXPENSE',
  });
  const list = await tools.budgetStatus(month);

  if (cat) {
    const b = list.find((x) => x.category.id === cat.id || x.budget.categoryId === cat.id);
    if (!b) {
      const { total } = await tools.sumTransactions({
        range,
        type: 'EXPENSE',
        categoryIds: [cat.id],
      });
      return base(
        'BUDGET_STATUS',
        `Vous n'avez pas de budget pour ${cat.name}. ${capitalize(label)}, vous y avez dépensé ${formatMoney(total)}. Vous pouvez en créer un depuis la page Budgets.`,
        {
          highlights: [money(`Dépenses ${cat.name}`, total)],
          period: outPeriod,
          href,
          suggestions: [
            'Où en sont mes budgets ce mois-ci ?',
            `Combien je dépense en moyenne en ${cat.name.toLowerCase()} ?`,
          ],
        },
      );
    }
    const name = b.category.name;
    let text: string;
    if (b.level === 'EXCEEDED') {
      text = `${capitalize(label)}, votre budget ${name} est dépassé de ${formatMoney(Math.abs(b.remaining))} : ${formatMoney(b.spent)} dépensés pour un plafond de ${formatMoney(b.budget.amount)}.`;
    } else {
      text = `Il vous reste ${formatMoney(b.remaining)} dans votre budget ${name} ${label} : ${formatMoney(b.spent)} dépensés sur ${formatMoney(b.budget.amount)} (${formatPercent(b.ratio)}).`;
      if (b.projectedOverrun && b.projected !== null) {
        text += ` À ce rythme, vous atteindriez environ ${formatMoney(b.projected)} en fin de mois : un peu de vigilance vous évitera le dépassement.`;
      } else if (b.level === 'WARNING') {
        text += ' Vous approchez du plafond.';
      }
    }
    const pie: MiniChart | null =
      b.remaining > 0
        ? {
            kind: 'pie',
            title: `Budget ${name}`,
            data: [
              { label: 'Dépensé', value: b.spent },
              { label: 'Restant', value: b.remaining },
            ],
          }
        : {
            kind: 'bar',
            title: `Budget ${name}`,
            data: [
              { label: 'Plafond', value: b.budget.amount },
              { label: 'Dépensé', value: b.spent },
            ],
          };
    return base('BUDGET_STATUS', text, {
      highlights: [
        money(b.remaining >= 0 ? 'Reste' : 'Dépassement', Math.abs(b.remaining)),
        money('Dépensé', b.spent),
        percent('Utilisé', b.ratio),
      ],
      chart: pie,
      period: outPeriod,
      href,
      suggestions: [
        'Où en sont mes budgets ce mois-ci ?',
        `Mes plus grosses dépenses en ${name.toLowerCase()} ce mois-ci`,
      ],
    });
  }

  if (list.length === 0) {
    return base(
      'BUDGET_STATUS',
      "Vous n'avez pas encore de budget. Créez-en depuis la page Budgets : je pourrai ensuite vous dire où vous en êtes.",
      { period: outPeriod, href: '/budgets', suggestions: ['Où part mon argent ce mois-ci ?'] },
    );
  }
  const planned = list.reduce((s, b) => s + b.budget.amount, 0);
  const spent = list.reduce((s, b) => s + b.spent, 0);
  const remaining = list.reduce((s, b) => s + b.remaining, 0);
  const exceeded = list.filter((b) => b.level === 'EXCEEDED');
  const warning = list.filter((b) => b.level === 'WARNING');
  let text = `${capitalize(label)}, vous avez utilisé ${formatPercent(planned === 0 ? 0 : spent / planned)} de vos budgets : ${formatMoney(spent)} sur ${formatMoney(planned)}.`;
  text +=
    remaining >= 0
      ? ` Il reste ${formatMoney(remaining)} au total.`
      : ` L'ensemble est dépassé de ${formatMoney(-remaining)}.`;
  if (exceeded.length > 0) {
    text += ` Dépassé${exceeded.length > 1 ? 's' : ''} : ${joinFr(exceeded.map((b) => `${b.category.name} (+${formatMoney(Math.abs(b.remaining))})`))}.`;
  }
  if (warning.length > 0) {
    text += ` À surveiller : ${joinFr(warning.map((b) => `${b.category.name} (${formatPercent(b.ratio)})`))}.`;
  }
  if (exceeded.length === 0 && warning.length === 0)
    text += ' Tous vos budgets sont sous contrôle.';
  return base('BUDGET_STATUS', text, {
    highlights: [money('Reste au total', remaining), count('Budgets dépassés', exceeded.length)],
    chart: {
      kind: 'bar',
      title: 'Dépensé par budget',
      data: list.map((b) => ({ label: shortLabel(b.category.name, 16), value: b.spent })),
    },
    period: outPeriod,
    href: buildTransactionsHref({ from: range.from, to: range.to, type: 'EXPENSE' }),
    suggestions: exceeded[0]
      ? [`Il me reste combien dans mon budget ${exceeded[0].category.name.toLowerCase()} ?`]
      : ['Combien j’aurai à la fin du mois ?'],
  });
};

const balance: Answerer = async ({ tools }) => {
  const b = await tools.balances();
  const accounts = [...b.accounts].sort((x, y) => y.balance - x.balance);
  let text = `Votre solde total est de ${formatMoney(b.total)}`;
  if (accounts.length === 0) text = "Vous n'avez encore aucun compte actif.";
  else if (accounts.length === 1) text += ` sur votre compte ${accounts[0]?.name ?? ''}.`;
  else {
    text += `, réparti sur ${accounts.length} comptes : ${joinFr(accounts.map((a) => `${a.name} (${formatMoney(a.balance)})`))}.`;
  }
  return base('BALANCE', text, {
    highlights: [money('Solde total', b.total)],
    chart:
      accounts.length >= 2
        ? {
            kind: 'bar',
            title: 'Solde par compte',
            data: accounts.map((a) => ({ label: shortLabel(a.name, 16), value: a.balance })),
          }
        : null,
    href: '/comptes',
    suggestions: ['Combien j’aurai à la fin du mois ?', 'Combien j’ai dépensé ce mois-ci ?'],
  });
};

const RELIABILITY_NOTE = {
  LOW: " Estimation encore approximative : l'historique est court.",
  MEDIUM: '',
  HIGH: ' Estimation fiable, fondée sur un historique régulier.',
} as const;

const forecast: Answerer = async ({ tools, today, norm }) => {
  const f = await tools.forecast();
  const eom = f.endOfMonth;
  const wantsMonths = /\b(?:prochains? mois|mois prochain|dans \d+ mois|trimestre prochain)\b/.test(
    norm,
  );
  let text = `D'après votre rythme actuel, votre solde devrait être d'environ ${formatMoney(eom.expected)} à la fin du mois (entre ${formatMoney(eom.low)} et ${formatMoney(eom.high)}).`;
  if (wantsMonths && f.months.length > 0) {
    text += ` Ensuite : ${joinFr(f.months.map((m) => `fin ${formatMonthFR(monthOf(m.date))} ≈ ${formatMoney(m.expected)}`))}.`;
  }
  text += RELIABILITY_NOTE[f.reliability];
  const points = f.chart
    .map((p) => ({ label: formatMonthFR(p.month, 'short'), value: p.actual ?? p.expected }))
    .filter((p): p is { label: string; value: number } => p.value !== null);
  return base('FORECAST', text, {
    highlights: [money('Fin du mois (estimé)', eom.expected), money('Scénario prudent', eom.low)],
    chart: points.length >= 2 ? { kind: 'line', title: 'Solde réel et prévu', data: points } : null,
    period: { from: today, to: eom.date, label: 'fin du mois' },
    href: null,
    suggestions: ['Est-ce que je peux me permettre un achat de 300 DT ?', 'Quel est mon solde ?'],
  });
};

const canAfford: Answerer = async ({ tools, amount, today }) => {
  if (amount === null) {
    return base(
      'CAN_AFFORD',
      'Pour vous répondre, il me faut le montant de l’achat. Par exemple : « Est-ce que je peux me permettre un téléphone à 900 dinars ? »',
      {
        suggestions: [
          'Est-ce que je peux me permettre un achat de 300 DT ?',
          'Combien j’aurai à la fin du mois ?',
        ],
      },
    );
  }
  const f = await tools.forecast();
  const { expected, low } = f.endOfMonth;
  const after = expected - amount;
  let text: string;
  if (low >= amount) {
    text = `Oui, cela semble raisonnable. Même dans un scénario prudent, votre solde de fin de mois serait d'environ ${formatMoney(low)} : après cet achat de ${formatMoney(amount)}, il vous resterait ${formatMoney(low - amount)}.`;
  } else if (expected >= amount) {
    text = `C'est possible, mais serré. Votre solde prévu en fin de mois est de ${formatMoney(expected)} : il ne resterait que ${formatMoney(after)} après cet achat de ${formatMoney(amount)}, et le scénario prudent (${formatMoney(low)}) ne le couvre pas. Attendre la prochaine rentrée d'argent serait plus confortable.`;
  } else {
    text = `Mieux vaut patienter : votre solde prévu en fin de mois (${formatMoney(expected)}) ne couvre pas cet achat de ${formatMoney(amount)}. Il manquerait environ ${formatMoney(amount - expected)}.`;
  }
  return base('CAN_AFFORD', text, {
    highlights: [money('Achat envisagé', amount), money('Reste prévu après achat', after)],
    chart: {
      kind: 'bar',
      title: 'Fin de mois prévue',
      data: [
        { label: 'Sans l’achat', value: expected },
        { label: 'Avec l’achat', value: after },
      ],
    },
    period: { from: today, to: f.endOfMonth.date, label: 'fin du mois' },
    href: null,
    suggestions: ['Combien j’aurai à la fin du mois ?', 'Quand vais-je atteindre mon objectif ?'],
  });
};

const subscriptions: Answerer = async ({ tools }) => {
  const rules = (await tools.recurring())
    .filter((r) => r.active && r.type === 'EXPENSE')
    .map((r) => ({ rule: r, monthly: monthlyEquivalent(r) }))
    .sort((a, b) => b.monthly - a.monthly);
  if (rules.length === 0) {
    return base(
      'SUBSCRIPTIONS',
      "Vous n'avez aucune dépense récurrente active. Déclarez vos abonnements depuis la page Récurrents : des suggestions détectées automatiquement vous y attendent peut-être.",
      { href: '/recurrents', suggestions: ['Où part mon argent ce mois-ci ?'] },
    );
  }
  const total = rules.reduce((s, r) => s + r.monthly, 0);
  const shown = rules.slice(0, 6);
  const list = shown.map(
    ({ rule }) => `${rule.label} (${formatMoney(rule.amount)} ${FREQUENCY_LABEL[rule.frequency]})`,
  );
  let text = `Vous avez ${plural(rules.length, 'dépense récurrente active', 'dépenses récurrentes actives')}, soit environ ${formatMoney(total)} par mois : ${joinFr(list)}`;
  text += rules.length > shown.length ? `, et ${rules.length - shown.length} autre(s).` : '.';
  const next = [...rules].sort((a, b) => (a.rule.nextDate < b.rule.nextDate ? -1 : 1))[0];
  if (next) {
    text += ` Prochaine échéance : ${next.rule.label}, le ${formatDateFR(next.rule.nextDate, 'dayMonth')} (${formatMoney(next.rule.amount)}).`;
  }
  return base('SUBSCRIPTIONS', text, {
    highlights: [money('Par mois', total), count('Récurrences actives', rules.length)],
    chart: {
      kind: 'pie',
      title: 'Coût mensuel des récurrences',
      data: shown.map(({ rule, monthly }) => ({
        label: shortLabel(rule.label, 18),
        value: monthly,
      })),
    },
    href: '/recurrents',
    suggestions: ['Quel est mon taux d’épargne ce mois-ci ?', 'Combien j’aurai à la fin du mois ?'],
  });
};

const goalProgress: Answerer = async ({ tools, norm, today }) => {
  const goals = await tools.goals();
  if (goals.length === 0) {
    return base(
      'GOAL_PROGRESS',
      "Vous n'avez pas encore d'objectif d'épargne. Créez-en un depuis la page Objectifs : je pourrai alors estimer quand vous l'atteindrez.",
      { href: '/objectifs', suggestions: ['Quel est mon taux d’épargne cette année ?'] },
    );
  }
  const matched = matchGoal(norm, goals)?.goal ?? (goals.length === 1 ? goals[0] : undefined);
  if (!matched) {
    const list = goals.map(
      (g) =>
        `« ${g.name} » à ${formatPercent(Math.min(1, g.ratio))} (${formatMoney(g.savedAmount)} sur ${formatMoney(g.targetAmount)})`,
    );
    return base(
      'GOAL_PROGRESS',
      `Vous avez ${plural(goals.length, 'objectif')} : ${joinFr(list)}. Précisez le nom d'un objectif pour savoir quand vous l'atteindrez.`,
      {
        highlights: [
          money(
            'Épargné au total',
            goals.reduce((s, g) => s + g.savedAmount, 0),
          ),
        ],
        chart: {
          kind: 'bar',
          title: 'Épargne par objectif',
          data: goals.map((g) => ({ label: shortLabel(g.name, 18), value: g.savedAmount })),
        },
        href: '/objectifs',
        suggestions: goals
          .slice(0, 3)
          .map((g) => `Quand vais-je atteindre mon objectif ${g.name} ?`),
      },
    );
  }
  const g = matched;
  const remaining = Math.max(0, g.targetAmount - g.savedAmount);
  if (g.status === 'COMPLETED' || remaining === 0) {
    return base(
      'GOAL_PROGRESS',
      `Bravo, votre objectif « ${g.name} » est atteint : ${formatMoney(g.savedAmount)} épargnés sur ${formatMoney(g.targetAmount)}.`,
      {
        highlights: [money('Épargné', g.savedAmount), percent('Progression', 1)],
        href: '/objectifs',
        suggestions: ['Où en sont mes objectifs ?'],
      },
    );
  }
  const months = lastCompleteMonths(today, 3);
  const monthly = await tools.monthlyTotals({
    range: {
      from: monthStart(months[0] ?? monthOf(today)),
      to: monthEnd(months[2] ?? monthOf(today)),
    },
  });
  const sim = simulateWhatIf({
    today,
    goal: g,
    monthly,
    categorySpending: [],
    adjustments: [],
    extraMonthlySaving: 0,
  });
  let text = `Vous avez épargné ${formatMoney(g.savedAmount)} sur ${formatMoney(g.targetAmount)} pour « ${g.name} » (${formatPercent(g.ratio)}) ; il reste ${formatMoney(remaining)}.`;
  if (sim.baselineDate) {
    text += ` Au rythme de votre épargne récente (${formatMoney(sim.baselineMonthlySaving)} par mois, si elle y est entièrement consacrée), vous l'atteindriez vers ${formatMonthFR(monthOf(sim.baselineDate))}.`;
  } else {
    text += ` Au rythme actuel, votre épargne mensuelle (${formatMoney(sim.baselineMonthlySaving)}) ne permet pas de le faire avancer : un versement régulier, même modeste, ferait la différence.`;
  }
  if (g.targetDate) {
    if (g.status === 'OVERDUE') {
      text += ` La date visée (${formatDateFR(g.targetDate)}) est dépassée : vous pouvez la repousser depuis la page Objectifs.`;
    } else if (g.monthlyNeeded !== null) {
      text += ` Pour tenir votre date cible (${formatDateFR(g.targetDate)}), il faudrait y consacrer ${formatMoney(g.monthlyNeeded)} par mois.`;
    }
  }
  const timeline = sim.timeline.slice(0, 12);
  return base('GOAL_PROGRESS', text, {
    highlights: [
      money('Épargné', g.savedAmount),
      money('Reste', remaining),
      percent('Progression', g.ratio),
    ],
    chart:
      timeline.length >= 2 && sim.baselineMonthlySaving > 0
        ? {
            kind: 'line',
            title: `Projection « ${g.name} »`,
            data: timeline.map((p) => ({
              label: formatMonthFR(p.month, 'short'),
              value: p.baseline,
            })),
          }
        : null,
    href: '/objectifs',
    suggestions: ['Quel est mon taux d’épargne cette année ?', 'Où part mon argent ce mois-ci ?'],
  });
};

const savingsRate: Answerer = async ({ tools, period }) => {
  const monthly = await tools.monthlyTotals({ range: period });
  const income = monthly.reduce((s, m) => s + m.income, 0);
  const expense = monthly.reduce((s, m) => s + m.expense, 0);
  const when = capitalize(inPeriod(period.label));
  const href = buildTransactionsHref({ from: period.from, to: period.to });
  if (income === 0) {
    const text =
      expense > 0
        ? `${when}, aucun revenu n'est enregistré (pour ${formatMoney(expense)} de dépenses) : impossible de calculer un taux d'épargne.`
        : `${when}, aucun revenu n'est enregistré : impossible de calculer un taux d'épargne.`;
    return base('SAVINGS_RATE', text, { period: periodOut(period), href });
  }
  const saved = income - expense;
  const rate = saved / income;
  let text: string;
  if (saved >= 0) {
    text = `${when}, votre taux d'épargne est de ${formatPercent(rate)} : vous avez mis de côté ${formatMoney(saved)} sur ${formatMoney(income)} de revenus.`;
    if (rate >= 0.2) text += " C'est au-dessus du repère de 20 %, bravo.";
    else if (rate >= 0.1) text += ' Le repère conseillé est de 20 % : vous en êtes proche.';
    else text += ' Viser 10 % serait un bon premier palier.';
  } else {
    text = `${when}, vos dépenses (${formatMoney(expense)}) dépassent vos revenus (${formatMoney(income)}) de ${formatMoney(-saved)} : votre taux d'épargne est négatif (${formatPercent(rate)}).`;
  }
  return base('SAVINGS_RATE', text, {
    highlights: [percent("Taux d'épargne", rate), money('Épargné', saved)],
    chart:
      monthly.length >= 2
        ? {
            kind: 'bar',
            title: 'Épargne par mois',
            data: monthly.map((m) => ({ label: formatMonthFR(m.month, 'short'), value: m.net })),
          }
        : null,
    period: periodOut(period),
    href,
    suggestions: ['Où part mon argent ce mois-ci ?', 'Quand vais-je atteindre mon objectif ?'],
  });
};

export const ANSWERS: Record<KnownIntent, Answerer> = {
  SPENDING_TOTAL: spendingTotal,
  INCOME_TOTAL: incomeTotal,
  COMPARE_PERIODS: comparePeriods,
  TOP_CATEGORIES: topCategories,
  TOP_MERCHANTS: topMerchants,
  BIGGEST_EXPENSE: biggestExpense,
  AVERAGE_SPENDING: averageSpending,
  BUDGET_STATUS: budgetStatus,
  BALANCE: balance,
  FORECAST: forecast,
  CAN_AFFORD: canAfford,
  SUBSCRIPTIONS: subscriptions,
  GOAL_PROGRESS: goalProgress,
  SAVINGS_RATE: savingsRate,
};
