/**
 * Dates métier : chaînes ISO « YYYY-MM-DD » (jour local Africa/Tunis) et mois « YYYY-MM ».
 * Aucune fonction ne lit l'horloge implicitement : « aujourd'hui » est toujours passé en
 * paramètre (déterminisme, testabilité). Les calculs passent par des jours epoch UTC.
 */

/** "YYYY-MM-DD" */
export type ISODate = string;
/** "YYYY-MM" */
export type YearMonth = string;

/** Intervalle de dates INCLUSIF aux deux bornes. */
export interface DateRange {
  from: ISODate;
  to: ISODate;
}

export const DEFAULT_TIMEZONE = 'Africa/Tunis';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YM_RE = /^(\d{4})-(\d{2})$/;
const DAY_MS = 86_400_000;

export const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;
export const MONTHS_FR_SHORT = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;
export const WEEKDAYS_FR = [
  'lundi',
  'mardi',
  'mercredi',
  'jeudi',
  'vendredi',
  'samedi',
  'dimanche',
] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function isISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isYearMonth(value: string): boolean {
  const m = YM_RE.exec(value);
  return !!m && Number(m[2]) >= 1 && Number(m[2]) <= 12;
}

export function parseISODate(iso: ISODate): { year: number; month: number; day: number } {
  const m = ISO_RE.exec(iso);
  if (!m || !isISODate(iso)) throw new RangeError(`Date ISO invalide : ${iso}`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

export function toISODate(year: number, month: number, day: number): ISODate {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Nombre de jours depuis 1970-01-01 (UTC). */
export function toEpochDay(iso: ISODate): number {
  const { year, month, day } = parseISODate(iso);
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function fromEpochDay(epochDay: number): ISODate {
  const d = new Date(epochDay * DAY_MS);
  return toISODate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Date du jour dans un fuseau donné (par défaut Africa/Tunis). */
export function todayInTimeZone(timeZone: string = DEFAULT_TIMEZONE, now: Date): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromEpochDay(toEpochDay(iso) + days);
}

/** b − a en jours. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Ajoute n mois en bornant au dernier jour du mois (31 janv. + 1 mois = 28/29 févr.). */
export function addMonths(iso: ISODate, months: number): ISODate {
  const { year, month, day } = parseISODate(iso);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const mo = (total % 12) + 1;
  return toISODate(y, mo, Math.min(day, daysInMonth(y, mo)));
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function isInRange(iso: ISODate, range: DateRange): boolean {
  return iso >= range.from && iso <= range.to;
}

/** Jour de la semaine ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(iso: ISODate): number {
  const dow = new Date(toEpochDay(iso) * DAY_MS).getUTCDay();
  return dow === 0 ? 7 : dow;
}

export function startOfWeek(iso: ISODate): ISODate {
  return addDays(iso, 1 - isoWeekday(iso));
}

export function monthOf(iso: ISODate): YearMonth {
  return iso.slice(0, 7);
}

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const m = YM_RE.exec(ym);
  if (!m || !isYearMonth(ym)) throw new RangeError(`Mois invalide : ${ym}`);
  return { year: Number(m[1]), month: Number(m[2]) };
}

export function toYearMonth(year: number, month: number): YearMonth {
  return `${year}-${pad2(month)}`;
}

export function addMonthsYM(ym: YearMonth, months: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  const total = year * 12 + (month - 1) + months;
  return toYearMonth(Math.floor(total / 12), (total % 12) + 1);
}

/** Nombre de mois de a vers b (b − a). */
export function diffMonthsYM(a: YearMonth, b: YearMonth): number {
  const pa = parseYearMonth(a);
  const pb = parseYearMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export function monthStart(ym: YearMonth): ISODate {
  return `${ym}-01`;
}

export function monthEnd(ym: YearMonth): ISODate {
  const { year, month } = parseYearMonth(ym);
  return toISODate(year, month, daysInMonth(year, month));
}

export function monthRange(ym: YearMonth): DateRange {
  return { from: monthStart(ym), to: monthEnd(ym) };
}

/** Liste des mois de `from` à `to` inclus. */
export function listMonths(from: YearMonth, to: YearMonth): YearMonth[] {
  const n = diffMonthsYM(from, to);
  const out: YearMonth[] = [];
  for (let i = 0; i <= n; i++) out.push(addMonthsYM(from, i));
  return out;
}

/** Les `count` derniers mois se terminant par le mois de `today` (inclus), du plus ancien au plus récent. */
export function lastMonths(today: ISODate, count: number): YearMonth[] {
  const end = monthOf(today);
  return listMonths(addMonthsYM(end, -(count - 1)), end);
}

export function quarterStart(iso: ISODate): ISODate {
  const { year, month } = parseISODate(iso);
  const qMonth = Math.floor((month - 1) / 3) * 3 + 1;
  return toISODate(year, qMonth, 1);
}

export function yearStart(iso: ISODate): ISODate {
  return `${iso.slice(0, 4)}-01-01`;
}

/** « 12 mars 2026 » (long), « 12 mars » (dayMonth), « 12/03/2026 » (short). */
export function formatDateFR(iso: ISODate, style: 'long' | 'short' | 'dayMonth' = 'long'): string {
  const { year, month, day } = parseISODate(iso);
  if (style === 'short') return `${pad2(day)}/${pad2(month)}/${year}`;
  const dayLabel = day === 1 ? '1er' : String(day);
  const monthName = MONTHS_FR[month - 1] ?? '';
  return style === 'dayMonth' ? `${dayLabel} ${monthName}` : `${dayLabel} ${monthName} ${year}`;
}

/** « mars 2026 » ou « mars » / « mars 26 » (short). */
export function formatMonthFR(
  ym: YearMonth,
  style: 'long' | 'short' | 'monthOnly' = 'long',
): string {
  const { year, month } = parseYearMonth(ym);
  if (style === 'monthOnly') return MONTHS_FR[month - 1] ?? '';
  if (style === 'short') return `${MONTHS_FR_SHORT[month - 1] ?? ''} ${String(year).slice(2)}`;
  return `${MONTHS_FR[month - 1] ?? ''} ${year}`;
}

/** Libellé relatif : « Aujourd'hui », « Hier », sinon « 12 mars ». */
export function formatRelativeDayFR(iso: ISODate, today: ISODate): string {
  const d = diffDays(iso, today);
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d === -1) return 'Demain';
  return iso.slice(0, 4) === today.slice(0, 4)
    ? formatDateFR(iso, 'dayMonth')
    : formatDateFR(iso, 'long');
}
