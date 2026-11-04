import { describe, expect, it } from 'vitest';
import { detectAnomalies } from './anomalies';
import { DEFAULT_TEST_CATEGORIES } from './__fixtures__/categories';
import {
  RENT_RULE,
  SALARY_RULE,
  SERIES_TODAY,
  cleanHistory,
  dirtyHistory,
  tx,
} from './__fixtures__/series';
import type { AnomalyInput } from './types';

const base = (transactions: AnomalyInput['transactions']): AnomalyInput => ({
  today: SERIES_TODAY,
  transactions,
  categories: DEFAULT_TEST_CATEGORIES,
  recurring: [SALARY_RULE, RENT_RULE],
  dismissedKeys: [],
});

describe('detectAnomalies', () => {
  it('aucun faux positif sur une série propre', () => {
    expect(detectAnomalies(base(cleanHistory()))).toEqual([]);
  });

  it('détecte toutes les anomalies injectées', () => {
    const { transactions, injected } = dirtyHistory();
    const found = detectAnomalies(base(transactions));
    const keys = found.map((a) => a.key);
    expect(keys).toContain(injected.unusual);
    expect(keys).toContain(`anomaly:duplicate:${injected.duplicate.join(':')}`);
    expect(keys).toContain(injected.price);
    expect(found).toHaveLength(3);

    const unusual = found.find((a) => a.kind === 'UNUSUAL_AMOUNT');
    expect(unusual).toMatchObject({
      actualAmount: 380_000,
      title: 'Dépense inhabituelle en Restaurants',
    });
    expect(unusual?.expectedAmount).toBeGreaterThan(20_000);
    expect(unusual?.score).toBeGreaterThan(3.5);
    const price = found.find((a) => a.kind === 'PRICE_INCREASE');
    expect(price).toMatchObject({ actualAmount: 49_000, expectedAmount: 45_000 });
    expect(price?.message).toContain('+9 %');
    for (const a of found) {
      expect(Number.isSafeInteger(a.actualAmount)).toBe(true);
      expect(a.message.length).toBeGreaterThan(10);
    }
    // Tri par date décroissante
    expect([...found].map((a) => a.date)).toEqual(
      found
        .map((a) => a.date)
        .sort()
        .reverse(),
    );
  });

  it('filtre les clés ignorées et respecte `since`', () => {
    const { transactions, injected } = dirtyHistory();
    const found = detectAnomalies({
      ...base(transactions),
      dismissedKeys: [injected.unusual, injected.price],
    });
    expect(found.map((a) => a.kind)).toEqual(['DUPLICATE']);
    expect(
      detectAnomalies({ ...base(transactions), since: '2026-11-01' }).map((a) => a.kind),
    ).toEqual(['DUPLICATE']);
  });

  it('repli IQR quand la catégorie a peu de données', () => {
    const txs = [
      tx('2026-09-01', 40, 'Pharmacie', 'Santé'),
      tx('2026-09-10', 35, 'Pharmacie', 'Santé'),
      tx('2026-10-01', 45, 'Pharmacie', 'Santé'),
      tx('2026-10-10', 38, 'Pharmacie', 'Santé'),
      tx('2026-10-20', 42, 'Pharmacie', 'Santé'),
      tx('2026-11-01', 400, 'Clinique', 'Santé'),
    ];
    const found = detectAnomalies(base(txs));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'UNUSUAL_AMOUNT',
      severity: 'DANGER',
      expectedAmount: 40_000,
    });
  });

  it('moins de 4 points : comparaison à la médiane globale', () => {
    const txs = [
      ...Array.from({ length: 10 }, (_, i) =>
        tx(`2026-10-${String(10 + i)}`, 10 + i, `Café ${i}`, 'Cafés'),
      ),
      tx('2026-11-02', 300, 'Opticien', 'Santé'),
      tx('2026-11-02', 30, 'Dentiste', 'Santé'),
      tx('2026-11-03', 250, 'Inconnu', null),
    ];
    const found = detectAnomalies(base(txs));
    expect(found.map((a) => a.transactionIds[0])).toEqual([txs[12]?.id, txs[10]?.id]);
    expect(found.find((a) => a.title === 'Dépense inhabituelle')?.expectedAmount).toBeNull();
  });

  it('doublons : ±2 jours pour les montants ≥ 10 DT, même jour en dessous', () => {
    const txs = [
      tx('2026-11-01', 87.25, 'CARREFOUR MARSA', 'Courses'),
      tx('2026-11-03', 87.25, 'PAIEMENT CB CARREFOUR', 'Courses'),
      tx('2026-11-01', 3.5, 'Café', 'Cafés'),
      tx('2026-11-02', 3.5, 'Café', 'Cafés'),
      tx('2026-11-02', 20, 'Loyer partiel', 'Loyer', { recurringId: 'r1' }),
      tx('2026-11-02', 20, 'Loyer partiel', 'Loyer', { recurringId: 'r1' }),
    ];
    const found = detectAnomalies(base(txs)).filter((a) => a.kind === 'DUPLICATE');
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('2 jours');
  });

  it('hausse de prix sur une série liée à une règle', () => {
    const txs = ['07', '08', '09', '10'].map((m, i) =>
      tx(`2026-${m}-05`, i === 3 ? 70 : 60, `Salle de sport ${m}`, 'Loisirs', {
        recurringId: 'gym',
      }),
    );
    const found = detectAnomalies(base(txs));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'PRICE_INCREASE',
      severity: 'INFO',
      expectedAmount: 60_000,
    });
  });
});
