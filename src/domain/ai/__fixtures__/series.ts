// Séries synthétiques déterministes (PRNG à graine fixe) pour les anomalies, les récurrences
// et les prévisions. Aujourd'hui = 2026-11-04.
import { addDays, addMonthsYM, daysInMonth, monthEnd, parseYearMonth, toISODate } from '../../dates';
import type { RecurringRule } from '../../types';
import type { AiTransaction } from '../types';
import { categoryId } from './categories';

export const SERIES_TODAY = '2026-11-04';

/** PRNG mulberry32 : déterministe, sans Math.random. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let counter = 0;
export function tx(
  date: string,
  dinars: number,
  label: string,
  category: string | null,
  extra: Partial<AiTransaction> = {},
): AiTransaction {
  counter++;
  return {
    id: `t${String(counter).padStart(5, '0')}`,
    date,
    amount: Math.round(dinars * 1000),
    type: category === 'Salaire' || category === 'Freelance' ? 'INCOME' : 'EXPENSE',
    label,
    categoryId: category === null ? null : categoryId(category),
    accountId: 'acc_bank',
    recurringId: null,
    ...extra,
  };
}

export function rule(partial: Partial<RecurringRule> & Pick<RecurringRule, 'id' | 'label' | 'amount' | 'nextDate'>): RecurringRule {
  return {
    accountId: 'acc_bank',
    categoryId: null,
    type: 'EXPENSE',
    frequency: 'MONTHLY',
    startDate: '2026-01-01',
    endDate: null,
    active: true,
    autoCreate: true,
    ...partial,
  };
}

export const SALARY_RULE = rule({
  id: 'rec_sal',
  label: 'Salaire',
  type: 'INCOME',
  amount: 2_600_000,
  nextDate: '2026-12-01',
});
export const RENT_RULE = rule({ id: 'rec_loyer', label: 'Loyer', amount: 750_000, nextDate: '2026-12-03' });

/**
 * Six mois « propres » (mai → 4 novembre 2026) : salaire et loyer déclarés, internet Ooredoo
 * 45 DT et Netflix 39 DT non déclarés, courses, cafés, restaurants et taxis variés.
 */
export function cleanHistory(): AiTransaction[] {
  const rand = prng(42);
  const out: AiTransaction[] = [];
  const start = '2026-05-01';
  for (let d = start; d <= SERIES_TODAY; d = addDays(d, 1)) {
    const day = Number(d.slice(8));
    if (day === 1) out.push(tx(d, 2600, 'VIREMENT SALAIRE', 'Salaire', { recurringId: 'rec_sal' }));
    if (day === 3) out.push(tx(d, 750, 'Loyer', 'Loyer', { recurringId: 'rec_loyer' }));
    if (day === 10) out.push(tx(d, 45, 'OOREDOO INTERNET', 'Télécom'));
    if (day === 15) out.push(tx(d, 39, 'NETFLIX.COM', 'Abonnements'));
    // Un café par jour, 1,5 à 4,5 DT
    out.push(tx(d, 1.5 + Math.round(rand() * 3000) / 1000, 'Café', 'Cafés'));
    // Courses 2 à 3 fois par semaine
    if (rand() < 0.4) {
      const shop = ['CARREFOUR MARSA', 'MONOPRIX LAC', 'AZIZA ARIANA', 'MAGASIN GENERAL'][Math.floor(rand() * 4)] ?? 'MONOPRIX';
      out.push(tx(d, 30 + Math.round(rand() * 90_000) / 1000, shop, 'Courses'));
    }
    // Restaurant une fois par semaine environ
    if (rand() < 0.15) {
      const resto = ['Plan B', 'Pizza Hut', 'Restaurant Le Golfe'][Math.floor(rand() * 3)] ?? 'Resto';
      out.push(tx(d, 25 + Math.round(rand() * 35_000) / 1000, resto, 'Restaurants'));
    }
    // Taxi un jour sur trois
    if (rand() < 0.33) out.push(tx(d, 5 + Math.round(rand() * 10_000) / 1000, 'Taxi', 'Transport'));
  }
  return out;
}

/** Historique propre + 3 anomalies injectées : restaurant 380 DT, café en double, Ooredoo 49 DT. */
export function dirtyHistory(): { transactions: AiTransaction[]; injected: { unusual: string; duplicate: string[]; price: string } } {
  const base = cleanHistory();
  // Hausse d'abonnement : dernier prélèvement Ooredoo (10 octobre) à 49 DT.
  const transactions = base.map((t) =>
    t.label === 'OOREDOO INTERNET' && t.date === '2026-10-10' ? { ...t, amount: 49_000 } : t,
  );
  const unusual = tx('2026-10-25', 380, 'Restaurant Dar El Jeld', 'Restaurants');
  const cafe = transactions.find((t) => t.label === 'Café' && t.date === '2026-11-02');
  if (!cafe) throw new Error('café introuvable');
  const dup = { ...cafe, id: 'dup_cafe' };
  transactions.push(unusual, dup);
  return {
    transactions,
    injected: {
      unusual: `anomaly:unusual:${unusual.id}`,
      duplicate: [cafe.id, dup.id].sort(),
      price: 'anomaly:price:ooredoo internet:2026-10',
    },
  };
}

/**
 * Série linéaire bruitée : 12 mois complets (nov. 2025 → oct. 2026) puis 3 mois « réels »
 * (nov. 2026 → janv. 2027). Flux net mensuel = 200 DT + 15 DT·k + bruit fixe.
 * Revenus le 1er, dépenses réparties sur 4 dates du mois.
 */
export const LINEAR_NOISE = [30, -25, 10, -35, 20, -5, 35, -20, 0, 25, -30, 15, 10, -15, 5];

export function linearSeries(): {
  history: AiTransaction[];
  future: AiTransaction[];
  months: string[];
  initialBalance: number;
} {
  const first = '2025-11';
  const history: AiTransaction[] = [];
  const future: AiTransaction[] = [];
  const months: string[] = [];
  for (let k = 0; k < 15; k++) {
    const ym = addMonthsYM(first, k);
    months.push(ym);
    const { year, month } = parseYearMonth(ym);
    const net = 200 + 15 * k + (LINEAR_NOISE[k] ?? 0);
    const income = 2000;
    const expense = income - net;
    const target = k < 12 ? history : future;
    target.push(tx(toISODate(year, month, 1), income, 'Salaire société', 'Salaire'));
    const days = [5, 12, 19, Math.min(26, daysInMonth(year, month))];
    const parts = [0.4, 0.25, 0.2, 0.15];
    let left = Math.round(expense * 1000);
    days.forEach((day, i) => {
      const amount = i === days.length - 1 ? left : Math.round(expense * 1000 * (parts[i] ?? 0));
      left -= amount;
      target.push(
        tx(toISODate(year, month, day), amount / 1000, `Courses semaine ${i + 1}`, 'Courses'),
      );
    });
  }
  return { history, future, months, initialBalance: 1_000_000 };
}

export const LINEAR_TODAY = monthEnd('2026-10');
