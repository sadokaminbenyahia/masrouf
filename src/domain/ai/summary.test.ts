import { describe, expect, it } from 'vitest';
import type { BudgetProgress, GoalProgress } from '../types';
import { generateMonthlySummary, pickTemplate } from './summary';
import type { AiCategory, AiTransaction, MonthlySummaryInput } from './types';

const CATS: AiCategory[] = [
  { id: 'courses', name: 'Courses', kind: 'EXPENSE' },
  { id: 'resto', name: 'Restaurants', kind: 'EXPENSE' },
  { id: 'cafes', name: 'Cafés', kind: 'EXPENSE' },
  { id: 'loyer', name: 'Loyer', kind: 'EXPENSE' },
  { id: 'telecom', name: 'Télécom', kind: 'EXPENSE' },
  { id: 'salaire', name: 'Salaire', kind: 'INCOME' },
];

let n = 0;
const tx = (
  date: string,
  amount: number,
  categoryId: string | null,
  label: string,
  type: AiTransaction['type'] = 'EXPENSE',
): AiTransaction => ({ id: `t${++n}`, date, amount, type, label, categoryId, accountId: 'a', recurringId: null });

function richTransactions(): AiTransaction[] {
  const out: AiTransaction[] = [];
  const months = ['2026-06', '2026-07', '2026-08', '2026-09'];
  months.forEach((ym, i) => {
    const last = i === months.length - 1;
    out.push(tx(`${ym}-01`, 2_000_000, 'salaire', 'SALAIRE', 'INCOME'));
    out.push(tx(`${ym}-03`, 750_000, 'loyer', 'LOYER'));
    out.push(tx(`${ym}-11`, last ? 49_000 : 45_000, 'telecom', 'OOREDOO INTERNET'));
    out.push(tx(`${ym}-05`, 150_000, 'courses', 'CARREFOUR'));
    out.push(tx(`${ym}-15`, 140_000, 'courses', 'MONOPRIX'));
    out.push(tx(`${ym}-20`, 130_000, 'courses', 'AZIZA'));
    out.push(tx(`${ym}-08`, last ? 420_000 : 90_000, 'resto', 'RESTAURANT'));
    const cafes = last ? 20 : 8;
    for (let d = 1; d <= cafes; d++) out.push(tx(`${ym}-${String(d).padStart(2, '0')}`, 3_500, 'cafes', 'CAFE'));
    if (last) out.push(tx(`${ym}-25`, 400_000, null, 'ACHAT DIVERS'));
    out.push(tx(`${ym}-02`, 300_000, null, 'RETRAIT', 'TRANSFER'));
  });
  return out;
}

const BUDGETS: BudgetProgress[] = [
  {
    budget: { id: 'b1', categoryId: 'resto', amount: 150_000, sortOrder: 0 },
    category: { id: 'resto', name: 'Restaurants', kind: 'EXPENSE', group: 'WANTS', icon: 'Utensils', color: '#000000', sortOrder: 0 },
    month: '2026-09',
    spent: 420_000,
    remaining: -270_000,
    ratio: 2.8,
    level: 'EXCEEDED',
    projected: null,
    projectedOverrun: false,
  },
];

const GOALS: GoalProgress[] = [
  {
    id: 'g1',
    name: 'Voyage à Djerba',
    targetAmount: 1_500_000,
    savedAmount: 600_000,
    targetDate: '2026-12-01',
    icon: 'Plane',
    color: '#000000',
    sortOrder: 0,
    completedAt: null,
    ratio: 0.4,
    remaining: 900_000,
    monthlyNeeded: 300_000,
    monthsLeft: 3,
    status: 'AT_RISK',
  },
];

function rich(seed = 'user-1'): MonthlySummaryInput {
  return {
    month: '2026-09',
    today: '2026-10-04',
    transactions: richTransactions(),
    categories: CATS,
    budgets: BUDGETS,
    goals: GOALS,
    seed,
  };
}

describe('generateMonthlySummary', () => {
  it('est déterministe', () => {
    expect(generateMonthlySummary(rich())).toEqual(generateMonthlySummary(rich()));
  });

  it('varie selon la graine', () => {
    const texts = new Set(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((s) => JSON.stringify([generateMonthlySummary(rich(s)).title, generateMonthlySummary(rich(s)).paragraphs])),
    );
    expect(texts.size).toBeGreaterThan(1);
  });

  it('jeu riche : faits chiffrés, paragraphes courts, 3 recommandations distinctes chiffrées', () => {
    const s = generateMonthlySummary(rich());
    expect(s.month).toBe('2026-09');
    expect(s.paragraphs.length).toBeGreaterThanOrEqual(2);
    expect(s.paragraphs.length).toBeLessThanOrEqual(4);
    expect(s.paragraphs[0]).toMatch(/septembre 2026|Bilan de septembre/);
    // dépenses : 750 + 49 + 420 + 420 + 70 + 400 = 2 109 DT
    expect(s.highlights[0]).toEqual({ label: 'Dépenses', value: 2_109_000, format: 'money' });
    expect(s.highlights[1]?.value).toBe(2_000_000);
    expect(s.highlights.find((h) => h.label === "Taux d'épargne")?.format).toBe('percent');
    expect(s.recommendations).toHaveLength(3);
    const titles = s.recommendations.map((r) => r.title);
    expect(new Set(titles).size).toBe(3);
    for (const r of s.recommendations) {
      expect(r.impact).not.toBeNull();
      expect(Number.isSafeInteger(r.impact)).toBe(true);
      expect(r.impact ?? 0).toBeGreaterThan(0);
    }
    // Trié par gain : hausse Restaurants (420 − 90 = 330 DT) > épargne à 10 % (200 + 109 = 309 DT)
    // > objectif en retard (300 DT) ; le budget Restaurants dépassé est écarté (même catégorie).
    expect(s.recommendations.map((r) => r.impact)).toEqual([330_000, 309_000, 300_000]);
    expect(s.recommendations[0]?.title).toBe('Freiner la hausse en Restaurants');
    expect(s.recommendations[1]?.title).toBe("Viser 10 % d'épargne");
    expect(s.recommendations[2]?.title).toMatch(/Remettre « Voyage à Djerba »/);
  });

  it('détecte les petites dépenses fréquentes et la hausse d’abonnement', () => {
    const input = { ...rich(), budgets: [], goals: [] };
    input.transactions = input.transactions.map((t) => (t.label === 'SALAIRE' ? { ...t, amount: 5_000_000 } : t));
    const s = generateMonthlySummary(input);
    const titles = s.recommendations.map((r) => r.title).join(' | ');
    expect(titles).toMatch(/Freiner la hausse en Restaurants/);
    expect(titles).toMatch(/petites dépenses en Cafés|Hausse de « OOREDOO INTERNET »/);
    expect(s.recommendations).toHaveLength(3);
  });

  it('abonnement en hausse repéré', () => {
    const txs: AiTransaction[] = ['2026-06', '2026-07', '2026-08', '2026-09'].flatMap((ym, i) => [
      tx(`${ym}-01`, 3_000_000, 'salaire', 'SALAIRE', 'INCOME'),
      tx(`${ym}-11`, i === 3 ? 49_000 : 45_000, 'telecom', 'OOREDOO 1234'),
    ]);
    const s = generateMonthlySummary({ ...rich(), transactions: txs, budgets: [], goals: [] });
    const sub = s.recommendations.find((r) => r.title.startsWith('Hausse de'));
    expect(sub?.impact).toBe(4_000);
    expect(sub?.href).toBe('/recurrents');
  });

  it('mois vide : texte adapté, pas de crash', () => {
    const s = generateMonthlySummary({ ...rich(), month: '2027-01', transactions: [] });
    expect(s.paragraphs[0]).toMatch(/Aucune transaction/);
    expect(s.highlights).toHaveLength(0);
    expect(s.recommendations.length).toBeLessThanOrEqual(3);
  });

  it('mois en cours : comparaison à date, titre adapté', () => {
    const input = { ...rich(), today: '2026-09-15' };
    const s = generateMonthlySummary(input);
    expect(s.paragraphs[0]).toMatch(/1er septembre|septembre/);
    expect(s.paragraphs.join(' ')).toMatch(/même date/);
  });

  it('sans revenu, objectif atteint, budgets respectés', () => {
    const txs = [tx('2026-09-02', 100_000, 'courses', 'CARREFOUR'), tx('2026-08-02', 100_000, 'courses', 'CARREFOUR')];
    const s = generateMonthlySummary({
      ...rich(),
      transactions: txs,
      budgets: [{ ...BUDGETS[0], spent: 10_000, remaining: 140_000, ratio: 0.07, level: 'OK' } as BudgetProgress],
      goals: [{ ...(GOALS[0] as GoalProgress), status: 'COMPLETED', savedAmount: 1_500_000, ratio: 1 }],
    });
    const all = s.paragraphs.join(' ');
    expect(all).toMatch(/revenu/);
    expect(all).toMatch(/Voyage à Djerba/);
    expect(s.highlights.some((h) => h.label === "Taux d'épargne")).toBe(false);
  });

  it('pickTemplate : choix stable par graine', () => {
    const t = [() => 'a', () => 'b', () => 'c'];
    const a = pickTemplate(t, 's', '2026-01', 'X', {});
    expect(pickTemplate(t, 's', '2026-01', 'X', {})).toBe(a);
    const all = new Set(['1', '2', '3', '4', '5', '6', '7', '8'].map((s) => pickTemplate(t, s, '2026-01', 'X', {})));
    expect(all.size).toBeGreaterThan(1);
  });
});
