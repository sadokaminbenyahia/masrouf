import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addMonthsYM,
  compareISO,
  daysInMonth,
  diffDays,
  diffMonthsYM,
  formatDateFR,
  formatMonthFR,
  formatRelativeDayFR,
  fromEpochDay,
  isISODate,
  isInRange,
  isoWeekday,
  isYearMonth,
  lastMonths,
  listMonths,
  maxISO,
  minISO,
  monthEnd,
  monthOf,
  monthRange,
  parseISODate,
  parseYearMonth,
  quarterStart,
  startOfWeek,
  toEpochDay,
  todayInTimeZone,
  yearStart,
} from './dates';

describe('dates ISO', () => {
  it('valide les dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2024-02-29')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('26-01-01')).toBe(false);
    expect(isYearMonth('2026-12')).toBe(true);
    expect(isYearMonth('2026-00')).toBe(false);
    expect(() => parseISODate('2026-02-30')).toThrow(RangeError);
    expect(() => parseYearMonth('2026-1')).toThrow(RangeError);
  });

  it('arithmétique sur les jours', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(diffDays('2026-01-01', '2026-03-01')).toBe(59);
    expect(fromEpochDay(toEpochDay('2026-07-14'))).toBe('2026-07-14');
    expect(compareISO('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareISO('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareISO('2026-01-01', '2026-01-01')).toBe(0);
    expect(minISO('2026-01-02', '2026-01-01')).toBe('2026-01-01');
    expect(maxISO('2026-01-02', '2026-01-01')).toBe('2026-01-02');
  });

  it('ajoute des mois en bornant à la fin du mois', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
    expect(addMonths('2026-12-01', 1)).toBe('2027-01-01');
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('semaines, mois, trimestres', () => {
    expect(isoWeekday('2026-11-02')).toBe(1); // lundi
    expect(isoWeekday('2026-11-08')).toBe(7); // dimanche
    expect(startOfWeek('2026-11-08')).toBe('2026-11-02');
    expect(monthOf('2026-11-04')).toBe('2026-11');
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthRange('2026-11')).toEqual({ from: '2026-11-01', to: '2026-11-30' });
    expect(addMonthsYM('2026-01', -1)).toBe('2025-12');
    expect(diffMonthsYM('2025-11', '2026-02')).toBe(3);
    expect(listMonths('2025-11', '2026-01')).toEqual(['2025-11', '2025-12', '2026-01']);
    expect(lastMonths('2026-02-10', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(quarterStart('2026-11-04')).toBe('2026-10-01');
    expect(yearStart('2026-11-04')).toBe('2026-01-01');
    expect(isInRange('2026-11-04', { from: '2026-11-01', to: '2026-11-04' })).toBe(true);
    expect(isInRange('2026-11-05', { from: '2026-11-01', to: '2026-11-04' })).toBe(false);
  });

  it('formatage français', () => {
    expect(formatDateFR('2026-03-01')).toBe('1er mars 2026');
    expect(formatDateFR('2026-03-12', 'short')).toBe('12/03/2026');
    expect(formatDateFR('2026-03-12', 'dayMonth')).toBe('12 mars');
    expect(formatMonthFR('2026-08')).toBe('août 2026');
    expect(formatMonthFR('2026-08', 'short')).toBe('août 26');
    expect(formatMonthFR('2026-08', 'monthOnly')).toBe('août');
    expect(formatRelativeDayFR('2026-11-04', '2026-11-04')).toBe("Aujourd'hui");
    expect(formatRelativeDayFR('2026-11-03', '2026-11-04')).toBe('Hier');
    expect(formatRelativeDayFR('2026-11-05', '2026-11-04')).toBe('Demain');
    expect(formatRelativeDayFR('2026-10-12', '2026-11-04')).toBe('12 octobre');
    expect(formatRelativeDayFR('2025-10-12', '2026-11-04')).toBe('12 octobre 2025');
  });

  it("calcule « aujourd'hui » dans le fuseau de Tunis", () => {
    // 23h30 UTC le 31 déc. = 00h30 le 1er janv. à Tunis (UTC+1)
    expect(todayInTimeZone('Africa/Tunis', new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01');
    expect(todayInTimeZone('UTC', new Date('2025-12-31T23:30:00Z'))).toBe('2025-12-31');
  });
});
