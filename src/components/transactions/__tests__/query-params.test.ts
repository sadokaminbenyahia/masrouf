import { describe, expect, it } from 'vitest';
import { formatMoney } from '@/domain/money';
import {
  clearFilters,
  describeActiveFilters,
  describePeriod,
  detectPreset,
  exportHref,
  hasActiveFilters,
  nextSort,
  parseTransactionSearchParams,
  sameQuery,
  toSearchParams,
  withFilters,
} from '../query-params';

const TODAY = '2026-11-04';

describe('parseTransactionSearchParams', () => {
  it('renvoie la requête par défaut sans paramètre', () => {
    expect(parseTransactionSearchParams({})).toEqual({
      page: 1,
      pageSize: 25,
      sort: { field: 'date', direction: 'desc' },
    });
  });

  it('lit les filtres d’un clic de graphique (categoryId + période)', () => {
    const q = parseTransactionSearchParams(
      new URLSearchParams('categoryId=cat_1&from=2026-10-01&to=2026-10-31&type=EXPENSE'),
    );
    expect(q.categoryIds).toEqual(['cat_1']);
    expect(q.from).toBe('2026-10-01');
    expect(q.to).toBe('2026-10-31');
    expect(q.types).toEqual(['EXPENSE']);
  });

  it('accepte les valeurs répétées et séparées par des virgules, sans doublon', () => {
    const q = parseTransactionSearchParams({
      accountId: ['a1,a2', 'a2', 'a3'],
      categoryId: 'c1, c2',
      type: 'expense,INCOME',
    });
    expect(q.accountIds).toEqual(['a1', 'a2', 'a3']);
    expect(q.categoryIds).toEqual(['c1', 'c2']);
    expect(q.types).toEqual(['EXPENSE', 'INCOME']);
  });

  it('ignore les paramètres invalides', () => {
    const q = parseTransactionSearchParams({
      type: 'FOO',
      accountId: 'a b;c',
      from: '2026-02-30',
      to: 'hier',
      min: '-5',
      max: '12.5',
      page: '0',
      size: '30',
      sort: 'note',
      dir: 'up',
      uncategorized: 'oui',
    });
    expect(q).toEqual({ page: 1, pageSize: 25, sort: { field: 'date', direction: 'desc' } });
  });

  it('les trois types cochés équivalent à aucun filtre', () => {
    expect(parseTransactionSearchParams({ type: 'EXPENSE,INCOME,TRANSFER' }).types).toBeUndefined();
  });

  it('inverse des bornes de date ou de montant fournies à l’envers', () => {
    const q = parseTransactionSearchParams({
      from: '2026-10-31',
      to: '2026-10-01',
      min: '50000',
      max: '1000',
    });
    expect([q.from, q.to]).toEqual(['2026-10-01', '2026-10-31']);
    expect([q.minAmount, q.maxAmount]).toEqual([1000, 50000]);
  });

  it('lit tri, sens par défaut du champ, page, taille, tag, recherche et « sans catégorie »', () => {
    const q = parseTransactionSearchParams({
      sort: 'label',
      page: '3',
      size: '50',
      tag: 'vacances',
      q: '  café ',
      uncategorized: '1',
    });
    expect(q.sort).toEqual({ field: 'label', direction: 'asc' });
    expect(q.page).toBe(3);
    expect(q.pageSize).toBe(50);
    expect(q.tag).toBe('vacances');
    expect(q.search).toBe('café');
    expect(q.uncategorized).toBe(true);
  });
});

describe('toSearchParams', () => {
  it('fait l’aller-retour avec parseTransactionSearchParams', () => {
    const raw =
      'q=louage&type=EXPENSE&accountId=a1,a2&categoryId=c1&uncategorized=1&tag=travail&from=2026-10-01&to=2026-10-31&min=1000&max=90000&sort=amount&dir=asc&size=100&page=2';
    const q = parseTransactionSearchParams(new URLSearchParams(raw));
    // Les virgules sont encodées (%2C) par URLSearchParams.
    expect(decodeURIComponent(toSearchParams(q).toString())).toBe(raw);
    expect(sameQuery(q, parseTransactionSearchParams(toSearchParams(q)))).toBe(true);
  });

  it('omet les valeurs par défaut', () => {
    expect(toSearchParams(parseTransactionSearchParams({})).toString()).toBe('');
  });
});

describe('withFilters / clearFilters / hasActiveFilters', () => {
  const base = parseTransactionSearchParams({ q: 'café', page: '4', sort: 'amount', size: '50' });

  it('revient à la page 1 et retire les filtres vides', () => {
    const next = withFilters(base, { search: undefined, accountIds: [], tag: 'x' });
    expect(next.page).toBe(1);
    expect(next.search).toBeUndefined();
    expect(next.accountIds).toBeUndefined();
    expect(next.tag).toBe('x');
  });

  it('efface tous les filtres en gardant tri et taille de page', () => {
    const cleared = clearFilters(base);
    expect(cleared).toEqual({
      page: 1,
      pageSize: 50,
      sort: { field: 'amount', direction: 'desc' },
    });
    expect(hasActiveFilters(base)).toBe(true);
    expect(hasActiveFilters(cleared)).toBe(false);
  });
});

describe('nextSort', () => {
  it('inverse le sens sur la même colonne, sinon prend le sens par défaut', () => {
    expect(nextSort({ field: 'date', direction: 'desc' }, 'date')).toEqual({
      field: 'date',
      direction: 'asc',
    });
    expect(nextSort({ field: 'date', direction: 'desc' }, 'label')).toEqual({
      field: 'label',
      direction: 'asc',
    });
    expect(nextSort({ field: 'label', direction: 'asc' }, 'amount')).toEqual({
      field: 'amount',
      direction: 'desc',
    });
  });
});

describe('périodes', () => {
  it('reconnaît un preset ou renvoie CUSTOM', () => {
    expect(detectPreset({ from: '2026-11-01', to: '2026-11-30' }, TODAY)).toBe('THIS_MONTH');
    expect(detectPreset({ from: '2026-10-01', to: '2026-10-31' }, TODAY)).toBe('LAST_MONTH');
    expect(detectPreset({ from: '2026-10-03', to: '2026-10-31' }, TODAY)).toBe('CUSTOM');
  });

  it('décrit la période en français', () => {
    expect(describePeriod('2026-11-01', '2026-11-30', TODAY)).toBe('Ce mois');
    expect(describePeriod('2026-10-03', '2026-10-20', TODAY)).toBe('3 octobre – 20 octobre 2026');
    expect(describePeriod('2025-12-03', '2026-01-20', TODAY)).toBe(
      '3 décembre 2025 – 20 janvier 2026',
    );
    expect(describePeriod('2026-10-03', undefined, TODAY)).toBe('Depuis le 3 octobre 2026');
    expect(describePeriod(undefined, '2026-10-03', TODAY)).toBe("Jusqu'au 3 octobre 2026");
    expect(describePeriod(undefined, undefined, TODAY)).toBeNull();
  });
});

describe('describeActiveFilters', () => {
  it('produit une chip amovible par filtre', () => {
    const q = parseTransactionSearchParams({
      q: 'café',
      type: 'EXPENSE',
      accountId: 'a1',
      categoryId: 'c1,c2',
      from: '2026-11-01',
      to: '2026-11-30',
      min: '5000',
    });
    const chips = describeActiveFilters(q, {
      accountNames: new Map([['a1', 'BIAT']]),
      categoryNames: new Map([['c1', 'Cafés']]),
      today: TODAY,
    });
    expect(chips.map((c) => c.label)).toEqual([
      'Recherche : « café »',
      'Dépenses',
      'Compte : BIAT',
      'Catégorie : Cafés',
      'Catégorie : inconnue',
      'Période : Ce mois',
      `Montant ≥ ${formatMoney(5000)}`,
    ]);
    const category = chips.find((c) => c.id === 'category:c1');
    expect(category?.next.categoryIds).toEqual(['c2']);
    expect(chips.find((c) => c.id === 'period')?.next.from).toBeUndefined();
  });
});

describe('exportHref', () => {
  it('conserve la période filtrée', () => {
    expect(exportHref({ from: '2026-10-01', to: '2026-10-31' })).toBe(
      '/api/export/transactions?from=2026-10-01&to=2026-10-31',
    );
    expect(exportHref({})).toBe('/api/export/transactions');
  });
});
