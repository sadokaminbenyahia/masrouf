import { describe, expect, it } from 'vitest';
import { addPeriod, classifyPeriod, detectRecurring, isBillLabel, matchesRule } from './recurring-detect';
import { RENT_RULE, SALARY_RULE, SERIES_TODAY, cleanHistory, rule, tx } from './__fixtures__/series';

describe('detectRecurring', () => {
  it('trouve les abonnements non déclarés et ignore les règles existantes', () => {
    const found = detectRecurring({
      today: SERIES_TODAY,
      transactions: cleanHistory(),
      existing: [SALARY_RULE, RENT_RULE],
    });
    expect(found.map((c) => c.merchantKey).sort()).toEqual(['netflix com', 'ooredoo internet']);
    const netflix = found.find((c) => c.merchantKey === 'netflix com');
    expect(netflix).toMatchObject({
      key: 'recurring:EXPENSE:netflix com:MONTHLY',
      type: 'EXPENSE',
      frequency: 'MONTHLY',
      amount: 39_000,
      nextDate: '2026-11-15',
      occurrences: 6,
      accountId: 'acc_bank',
    });
    expect(netflix?.confidence).toBeGreaterThan(0.8);
    expect(netflix?.transactionIds).toHaveLength(6);
  });

  it('ne re-suggère pas une série couverte par une règle au même libellé', () => {
    const found = detectRecurring({
      today: SERIES_TODAY,
      transactions: cleanHistory(),
      existing: [rule({ id: 'r_net', label: 'Netflix.com', amount: 39_000, nextDate: '2026-11-15' })],
    });
    expect(found.map((c) => c.merchantKey)).toEqual(['ooredoo internet']);
  });

  it('factures variables (CV < 0,4), hebdomadaire, annuel, et séries interrompues', () => {
    const steg = ['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-01'].map((d, i) =>
      tx(d, [80, 120, 95, 140][i] ?? 80, 'SONEDE FACTURE', 'Factures'),
    );
    const weekly = ['2026-10-07', '2026-10-14', '2026-10-21', '2026-10-28', '2026-11-04'].map((d) =>
      tx(d, 20, 'Cours de piano', 'Éducation'),
    );
    const yearly = ['2023-09-15', '2024-09-14', '2025-09-15'].map((d) => tx(d, 300, 'Assurance auto', 'Divers'));
    const stopped = ['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'].map((d) =>
      tx(d, 15, 'Anghami', 'Abonnements'),
    );
    const found = detectRecurring({
      today: SERIES_TODAY,
      transactions: [...steg, ...weekly, ...yearly, ...stopped],
      existing: [],
    });
    const byKey = Object.fromEntries(found.map((c) => [c.merchantKey, c]));
    expect(byKey['sonede']).toMatchObject({ frequency: 'QUARTERLY', amount: 107_500 });
    expect(byKey['cours piano']).toMatchObject({ frequency: 'WEEKLY', nextDate: '2026-11-11' });
    // Échéance de septembre manquée : la prochaine est reportée d'un an.
    expect(byKey['assurance auto']).toMatchObject({ frequency: 'YEARLY', nextDate: '2027-09-15' });
    expect(byKey['anghami']).toBeUndefined();
  });

  it('rejette les montants trop variables et les intervalles irréguliers', () => {
    const variable = ['2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01'].map((d, i) =>
      tx(d, [10, 30, 11.4, 29] [i] ?? 10, 'Kiosque', 'Divers'),
    );
    const irregular = ['2026-08-01', '2026-08-04', '2026-09-20', '2026-10-01', '2026-10-30'].map((d) =>
      tx(d, 25, 'Lavage auto', 'Transport'),
    );
    expect(detectRecurring({ today: SERIES_TODAY, transactions: [...variable, ...irregular], existing: [] })).toEqual([]);
  });

  it('reporte nextDate dans le futur et suffixe les clés en doublon', () => {
    const a = ['2026-07-02', '2026-08-02', '2026-09-02', '2026-10-02'].map((d) => tx(d, 10, 'Club', 'Loisirs'));
    const b = ['2026-07-20', '2026-08-20', '2026-09-20', '2026-10-20'].map((d) => tx(d, 50, 'Club', 'Loisirs'));
    const found = detectRecurring({ today: SERIES_TODAY, transactions: [...a, ...b], existing: [] });
    expect(found.map((c) => c.key).sort()).toEqual([
      'recurring:EXPENSE:club:MONTHLY',
      'recurring:EXPENSE:club:MONTHLY:2',
    ]);
    expect(found.find((c) => c.amount === 10_000)?.nextDate).toBe('2026-12-02');
  });
});

describe('utilitaires', () => {
  it('classifyPeriod', () => {
    expect(classifyPeriod(7)).toBe('WEEKLY');
    expect(classifyPeriod(31)).toBe('MONTHLY');
    expect(classifyPeriod(60)).toBeNull();
    expect(classifyPeriod(91)).toBe('QUARTERLY');
    expect(classifyPeriod(365)).toBe('YEARLY');
  });

  it('addPeriod', () => {
    expect(addPeriod('2026-01-31', 'MONTHLY')).toBe('2026-02-28');
    expect(addPeriod('2026-01-01', 'QUARTERLY', 2)).toBe('2026-07-01');
    expect(addPeriod('2026-01-01', 'YEARLY')).toBe('2027-01-01');
    expect(addPeriod('2026-01-01', 'WEEKLY', 2)).toBe('2026-01-15');
  });

  it('isBillLabel et matchesRule', () => {
    expect(isBillLabel('FACTURE STEG')).toBe(true);
    expect(isBillLabel('Netflix')).toBe(false);
    const t = { label: 'Loyer novembre', type: 'EXPENSE' as const, recurringId: null };
    expect(matchesRule(t, [RENT_RULE])).toBe(true);
    expect(matchesRule({ ...t, label: 'Zara' }, [RENT_RULE])).toBe(false);
    expect(matchesRule({ ...t, label: 'Zara', recurringId: 'rec_loyer' }, [RENT_RULE])).toBe(true);
  });
});
