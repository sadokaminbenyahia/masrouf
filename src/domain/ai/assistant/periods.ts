/**
 * Périodes en français dans une question (texte déjà normalisé, sans accents) →
 * intervalles INCLUSIFS calculés à partir de `today`, avec un libellé lisible.
 */
import {
  addDays,
  addMonths,
  addMonthsYM,
  daysInMonth,
  diffDays,
  diffMonthsYM,
  formatDateFR,
  formatMonthFR,
  isoWeekday,
  monthEnd,
  monthOf,
  monthStart,
  MONTHS_FR,
  parseISODate,
  quarterStart,
  startOfWeek,
  toISODate,
  yearStart,
  type DateRange,
  type ISODate,
} from '../../dates';

export type PeriodUnit =
  'day' | 'week' | 'weekend' | 'month' | 'quarter' | 'year' | 'rolling' | 'custom';

export interface ParsedPeriod extends DateRange {
  label: string;
  unit: PeriodUnit;
  /** Position [début, fin[ dans le texte normalisé (null si période par défaut ou dérivée) */
  span: [number, number] | null;
  /** Remarque à ajouter à la réponse (ex. date future remplacée par la période par défaut) */
  note?: string;
}

const MONTH_NAMES = [
  'janvier',
  'fevrier',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'aout',
  'septembre',
  'octobre',
  'novembre',
  'decembre',
] as const;
const MONTH_RE = MONTH_NAMES.join('|');

const NUMBER_WORDS: Record<string, number> = {
  un: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
  quinze: 15,
  trente: 30,
};
const COUNT_RE = `(\\d{1,3}|${Object.keys(NUMBER_WORDS).join('|')})`;

function monthIndex(name: string | undefined): number | null {
  if (!name) return null;
  const i = (MONTH_NAMES as readonly string[]).indexOf(name);
  return i < 0 ? null : i + 1;
}

function parseCount(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = /^\d+$/.test(raw) ? Number(raw) : (NUMBER_WORDS[raw] ?? null);
  return n !== null && n > 0 ? n : null;
}

function parseYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n)) return null;
  if (raw.length === 2) return 2000 + n;
  return n >= 1970 && n <= 2100 ? n : null;
}

function parseDay(raw: string | undefined): number | null {
  if (!raw) return null;
  if (raw === '1er' || raw === 'premier') return 1;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

/** Année d'un mois sans année explicite : l'année courante si ≤ mois courant, sinon la précédente. */
function inferYear(month: number, today: ISODate): number {
  const { year, month: current } = parseISODate(today);
  return month <= current ? year : year - 1;
}

function safeDate(year: number, month: number, day: number): ISODate {
  return toISODate(year, month, Math.min(day, daysInMonth(year, month)));
}

function monthRangeOf(year: number, month: number): DateRange {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  return { from: monthStart(ym), to: monthEnd(ym) };
}

function quarterRange(iso: ISODate): DateRange {
  const from = quarterStart(iso);
  return { from, to: addDays(addMonths(from, 3), -1) };
}

function yearRange(year: number): DateRange {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

function isFullMonths(r: DateRange): boolean {
  return r.from.endsWith('-01') && r.to === monthEnd(monthOf(r.to)) && r.from <= r.to;
}

function quarterNumber(iso: ISODate): number {
  return Math.floor((parseISODate(iso).month - 1) / 3) + 1;
}

/** Libellé lisible d'un intervalle : « ce mois-ci », « en mars 2026 », « du 3 au 10 mars 2026 »… */
export function labelForRange(range: DateRange, today: ISODate): string {
  const ym = monthOf(today);
  const thisMonth = monthRangeOf(parseISODate(today).year, parseISODate(today).month);
  if (sameRange(range, thisMonth)) return 'ce mois-ci';
  const prev = addMonthsYM(ym, -1);
  if (sameRange(range, { from: monthStart(prev), to: monthEnd(prev) })) return 'le mois dernier';
  if (isFullMonths(range)) {
    const n = diffMonthsYM(monthOf(range.from), monthOf(range.to)) + 1;
    if (n === 1) return `en ${formatMonthFR(monthOf(range.from))}`;
    const q = quarterRange(range.from);
    if (n === 3 && sameRange(range, q)) {
      if (sameRange(q, quarterRange(today))) return 'ce trimestre';
      if (sameRange(q, quarterRange(addMonths(quarterStart(today), -3)))) {
        return 'le trimestre dernier';
      }
      const qn = quarterNumber(range.from);
      return `au ${qn === 1 ? '1er' : `${qn}e`} trimestre ${range.from.slice(0, 4)}`;
    }
    const y = parseISODate(range.from).year;
    if (sameRange(range, yearRange(y))) {
      const ty = parseISODate(today).year;
      if (y === ty) return 'cette année';
      if (y === ty - 1) return "l'an dernier";
      return `en ${y}`;
    }
  }
  const week = startOfWeek(today);
  if (sameRange(range, { from: week, to: addDays(week, 6) })) return 'cette semaine';
  if (sameRange(range, { from: addDays(week, -7), to: addDays(week, -1) })) {
    return 'la semaine dernière';
  }
  if (range.from === range.to) {
    if (range.from === today) return "aujourd'hui";
    if (range.from === addDays(today, -1)) return 'hier';
    return `le ${formatDateFR(range.from)}`;
  }
  const f = parseISODate(range.from);
  const t = parseISODate(range.to);
  const fromDay = f.day === 1 ? '1er' : String(f.day);
  if (f.year === t.year && f.month === t.month) return `du ${fromDay} au ${formatDateFR(range.to)}`;
  if (f.year === t.year) {
    return `du ${formatDateFR(range.from, 'dayMonth')} au ${formatDateFR(range.to)}`;
  }
  return `du ${formatDateFR(range.from)} au ${formatDateFR(range.to)}`;
}

interface Resolved {
  range: DateRange;
  unit: PeriodUnit;
  label?: string;
  note?: string;
}

/**
 * « depuis <date future> » : pas de période future ni d'intervalle inversé. On répond pour la
 * période par défaut (ce mois-ci) en le signalant, plutôt que de relire la date seule.
 */
function futureSince(today: ISODate, what: string): Resolved {
  const ym = monthOf(today);
  return {
    range: { from: monthStart(ym), to: monthEnd(ym) },
    unit: 'month',
    label: 'ce mois-ci',
    note: `${what} est dans le futur : je vous réponds pour ce mois-ci.`,
  };
}

interface Matcher {
  re: RegExp;
  resolve: (m: RegExpExecArray, today: ISODate) => Resolved | null;
}

function lastWeekend(today: ISODate): DateRange {
  const wd = isoWeekday(today);
  const saturday = wd >= 6 ? addDays(today, 6 - wd) : addDays(today, -(wd + 1));
  return { from: saturday, to: addDays(saturday, 1) };
}

function dayMonthYear(
  dRaw: string | undefined,
  mRaw: number | null,
  yRaw: string | undefined,
  fallbackMonth: number,
  fallbackYear: number | null,
  today: ISODate,
): { day: number; month: number; year: number } | null {
  const day = parseDay(dRaw);
  if (day === null) return null;
  const month = mRaw ?? fallbackMonth;
  const year = parseYear(yRaw) ?? fallbackYear ?? inferYear(month, today);
  return { day, month, year };
}

function resolveDayRange(
  d1: string | undefined,
  m1: number | null,
  y1: string | undefined,
  d2: string | undefined,
  m2: number | null,
  y2: string | undefined,
  today: ISODate,
): Resolved | null {
  const current = parseISODate(today).month;
  const end = dayMonthYear(d2, m2, y2, m1 ?? current, parseYear(y1), today);
  if (!end) return null;
  const startMonth = m1 ?? end.month;
  const startYear = parseYear(y1) ?? (startMonth > end.month && !y1 ? end.year - 1 : end.year);
  const start = dayMonthYear(d1, startMonth, undefined, startMonth, startYear, today);
  if (!start) return null;
  let from = safeDate(start.year, start.month, start.day);
  let to = safeDate(end.year, end.month, end.day);
  if (from > to) [from, to] = [to, from];
  return { range: { from, to }, unit: 'custom' };
}

const MATCHERS: Matcher[] = [
  {
    re: /\baujourd hui\b/g,
    resolve: (_m, today) => ({ range: { from: today, to: today }, unit: 'day' }),
  },
  {
    re: /\bavant hier\b/g,
    resolve: (_m, today) => {
      const d = addDays(today, -2);
      return { range: { from: d, to: d }, unit: 'day', label: 'avant-hier' };
    },
  },
  {
    re: /\bhier\b/g,
    resolve: (_m, today) => {
      const d = addDays(today, -1);
      return { range: { from: d, to: d }, unit: 'day' };
    },
  },
  {
    re: /\b(?:cette|de la) semaine(?! (?:derniere|passee|precedente))\b/g,
    resolve: (_m, today) => {
      const from = startOfWeek(today);
      return { range: { from, to: addDays(from, 6) }, unit: 'week' };
    },
  },
  {
    re: /\b(?:la |de la )?semaine (?:derniere|passee|precedente)\b/g,
    resolve: (_m, today) => {
      const from = addDays(startOfWeek(today), -7);
      return { range: { from, to: addDays(from, 6) }, unit: 'week' };
    },
  },
  {
    re: /\b(?:ce|du) (?:week ?end|weekend)(?! (?:dernier|passe))\b/g,
    resolve: (_m, today) => ({ range: lastWeekend(today), unit: 'weekend', label: 'ce week-end' }),
  },
  {
    re: /\b(?:le |du )?(?:week ?end|weekend) (?:dernier|passe)\b/g,
    resolve: (_m, today) => {
      const thisOne = lastWeekend(today);
      const isCurrent = isoWeekday(today) >= 6;
      const range = isCurrent
        ? { from: addDays(thisOne.from, -7), to: addDays(thisOne.to, -7) }
        : thisOne;
      return { range, unit: 'weekend', label: 'le week-end dernier' };
    },
  },
  {
    re: /\b(?:(?:ce|du) mois(?: ci)?(?! (?:dernier|passe|precedent|prochain))|mois (?:en cours|courant|actuel))\b/g,
    resolve: (_m, today) => {
      const ym = monthOf(today);
      return { range: { from: monthStart(ym), to: monthEnd(ym) }, unit: 'month' };
    },
  },
  {
    re: /\b(?:le |du |au )?mois (?:dernier|passe|precedent)\b/g,
    resolve: (_m, today) => {
      const ym = addMonthsYM(monthOf(today), -1);
      return { range: { from: monthStart(ym), to: monthEnd(ym) }, unit: 'month' };
    },
  },
  {
    re: /\bdepuis le debut (?:du |de ce )mois\b/g,
    resolve: (_m, today) => ({
      range: { from: monthStart(monthOf(today)), to: today },
      unit: 'custom',
      label: 'depuis le début du mois',
    }),
  },
  {
    re: /\b(?:ce|du) trimestre(?! (?:dernier|passe|precedent|prochain))\b/g,
    resolve: (_m, today) => ({ range: quarterRange(today), unit: 'quarter' }),
  },
  {
    re: /\b(?:le |du |au )?trimestre (?:dernier|passe|precedent)\b/g,
    resolve: (_m, today) => ({
      range: quarterRange(addMonths(quarterStart(today), -3)),
      unit: 'quarter',
    }),
  },
  {
    re: /\b(?:cette annee(?: ci)?|de l annee(?! (?:derniere|passee|precedente))|annee en cours)\b/g,
    resolve: (_m, today) => ({ range: yearRange(parseISODate(today).year), unit: 'year' }),
  },
  {
    re: /\bdepuis (?:le )?debut (?:de l |d )?annee\b/g,
    resolve: (_m, today) => ({
      range: { from: yearStart(today), to: today },
      unit: 'custom',
      label: "depuis le début de l'année",
    }),
  },
  {
    re: /\b(?:l |de l )?(?:annee (?:derniere|passee|precedente)|an (?:dernier|passe))\b/g,
    resolve: (_m, today) => ({ range: yearRange(parseISODate(today).year - 1), unit: 'year' }),
  },
  {
    re: /\b(?:en|annee|pour|de) (20\d{2})\b/g,
    resolve: (m) => {
      const y = parseYear(m[1]);
      return y === null ? null : { range: yearRange(y), unit: 'year' };
    },
  },
  {
    re: new RegExp(
      `\\b(?:(?:sur |durant |pendant |depuis )?(?:les |ces )?${COUNT_RE} derniers mois|(?:sur|durant|pendant) ${COUNT_RE} mois)\\b`,
      'g',
    ),
    resolve: (m, today) => {
      const n = parseCount(m[1] ?? m[2]);
      if (n === null || n > 120) return null;
      return {
        range: { from: addDays(addMonths(today, -n), 1), to: today },
        unit: 'rolling',
        label: n === 1 ? 'le dernier mois' : `les ${n} derniers mois`,
      };
    },
  },
  {
    re: new RegExp(
      `\\b(?:(?:sur |durant |pendant |depuis )?(?:les |ces )?${COUNT_RE} derniers jours|(?:sur|durant|pendant) ${COUNT_RE} jours)\\b`,
      'g',
    ),
    resolve: (m, today) => {
      const n = parseCount(m[1] ?? m[2]);
      if (n === null || n > 3660) return null;
      return {
        range: { from: addDays(today, -(n - 1)), to: today },
        unit: 'rolling',
        label: `les ${n} derniers jours`,
      };
    },
  },
  {
    re: new RegExp(
      `\\b(?:entre le|du) (\\d{1,2}|1er)(?: (${MONTH_RE}))?(?: (\\d{4}))? (?:et le|au) (\\d{1,2}|1er)(?: (${MONTH_RE}))?(?: (\\d{4}))?\\b`,
      'g',
    ),
    resolve: (m, today) =>
      resolveDayRange(m[1], monthIndex(m[2]), m[3], m[4], monthIndex(m[5]), m[6], today),
  },
  {
    re: /\b(?:entre le|du) (\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))? (?:et le|au) (\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\b/g,
    resolve: (m, today) => {
      const m1 = Number(m[2]);
      const m2 = Number(m[5]);
      if (m1 < 1 || m1 > 12 || m2 < 1 || m2 > 12) return null;
      return resolveDayRange(m[1], m1, m[3], m[4], m2, m[6], today);
    },
  },
  {
    re: new RegExp(`\\bdepuis (?:le )?(\\d{1,2}|1er) (${MONTH_RE})(?: (\\d{4}))?\\b`, 'g'),
    resolve: (m, today) => {
      const month = monthIndex(m[2]);
      const d = month === null ? null : dayMonthYear(m[1], month, m[3], month, null, today);
      if (!d) return null;
      const from = safeDate(d.year, d.month, d.day);
      return from > today
        ? futureSince(today, `Le ${formatDateFR(from)}`)
        : { range: { from, to: today }, unit: 'custom', label: `depuis le ${formatDateFR(from)}` };
    },
  },
  {
    re: new RegExp(
      `\\bdepuis (?:le mois de |le debut de |debut )?(${MONTH_RE})(?: (\\d{4}))?\\b`,
      'g',
    ),
    resolve: (m, today) => {
      const month = monthIndex(m[1]);
      if (month === null) return null;
      const year = parseYear(m[2]) ?? inferYear(month, today);
      const from = toISODate(year, month, 1);
      if (from > today) {
        const what = formatMonthFR(monthOf(from));
        return futureSince(today, what.charAt(0).toUpperCase() + what.slice(1));
      }
      const sameYear = year === parseISODate(today).year;
      return {
        range: { from, to: today },
        unit: 'custom',
        label: `depuis ${sameYear ? MONTHS_FR[month - 1] : formatMonthFR(monthOf(from))}`,
      };
    },
  },
  {
    re: new RegExp(`\\b(?:le )?(\\d{1,2}|1er) (${MONTH_RE})(?: (\\d{4}))?\\b`, 'g'),
    resolve: (m, today) => {
      const month = monthIndex(m[2]);
      const d = month === null ? null : dayMonthYear(m[1], month, m[3], month, null, today);
      if (!d) return null;
      const day = safeDate(d.year, d.month, d.day);
      return { range: { from: day, to: day }, unit: 'day' };
    },
  },
  {
    re: /\b(?:le )?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g,
    resolve: (m, today) => {
      const month = Number(m[2]);
      if (month < 1 || month > 12) return null;
      const d = dayMonthYear(m[1], month, m[3], month, null, today);
      if (!d) return null;
      const day = safeDate(d.year, d.month, d.day);
      return { range: { from: day, to: day }, unit: 'day' };
    },
  },
  {
    re: new RegExp(
      `\\b(?:(?:en|au mois de|du mois de|pour|de|d|sur) )?(${MONTH_RE})(?: (\\d{4}))?\\b`,
      'g',
    ),
    resolve: (m, today) => {
      const month = monthIndex(m[1]);
      if (month === null) return null;
      const year = parseYear(m[2]) ?? inferYear(month, today);
      return { range: monthRangeOf(year, month), unit: 'month' };
    },
  },
];

/** Toutes les périodes trouvées, dans l'ordre du texte, sans chevauchement (la plus longue gagne). */
export function parsePeriods(norm: string, today: ISODate): ParsedPeriod[] {
  const found: (ParsedPeriod & { order: number })[] = [];
  MATCHERS.forEach((matcher, order) => {
    const re = new RegExp(matcher.re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(norm)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const r = matcher.resolve(m, today);
      if (!r) continue;
      found.push({
        ...r.range,
        unit: r.unit,
        label: r.label ?? labelForRange(r.range, today),
        span: [m.index, m.index + m[0].length],
        ...(r.note !== undefined ? { note: r.note } : {}),
        order,
      });
    }
  });
  found.sort((a, b) => {
    const la = spanLength(a.span);
    const lb = spanLength(b.span);
    return lb - la || a.order - b.order;
  });
  const kept: (ParsedPeriod & { order: number })[] = [];
  for (const p of found) {
    if (!kept.some((k) => overlaps(k.span, p.span))) kept.push(p);
  }
  kept.sort((a, b) => spanStart(a.span) - spanStart(b.span));
  return kept.map(({ order: _order, ...p }) => p);
}

function spanLength(s: [number, number] | null): number {
  return s ? s[1] - s[0] : 0;
}
function spanStart(s: [number, number] | null): number {
  return s ? s[0] : 0;
}
function overlaps(a: [number, number] | null, b: [number, number] | null): boolean {
  if (!a || !b) return false;
  return a[0] < b[1] && b[0] < a[1];
}

/** Période par défaut : ce mois. */
export function defaultPeriod(today: ISODate): ParsedPeriod {
  const ym = monthOf(today);
  return { from: monthStart(ym), to: monthEnd(ym), unit: 'month', label: 'ce mois-ci', span: null };
}

/** Première période de la question, sinon ce mois. */
export function parsePeriod(norm: string, today: ISODate): ParsedPeriod {
  return parsePeriods(norm, today)[0] ?? defaultPeriod(today);
}

/** Période précédente de même durée (mois → mois précédent, 10 jours → 10 jours avant). */
export function previousPeriod(p: DateRange, today: ISODate): ParsedPeriod {
  let range: DateRange;
  if (isFullMonths(p)) {
    const n = diffMonthsYM(monthOf(p.from), monthOf(p.to)) + 1;
    range = {
      from: monthStart(addMonthsYM(monthOf(p.from), -n)),
      to: monthEnd(addMonthsYM(monthOf(p.to), -n)),
    };
  } else {
    const len = diffDays(p.from, p.to) + 1;
    range = { from: addDays(p.from, -len), to: addDays(p.from, -1) };
  }
  return {
    ...range,
    unit: isFullMonths(range) ? 'month' : 'custom',
    label: labelForRange(range, today),
    span: null,
  };
}

/** Nombre de mois calendaires couverts (1 pour un mois, 3 pour un trimestre…). */
export function monthsCovered(p: DateRange): number {
  return diffMonthsYM(monthOf(p.from), monthOf(p.to)) + 1;
}
