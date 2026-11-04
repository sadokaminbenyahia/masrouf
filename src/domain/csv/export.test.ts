import { describe, expect, it } from 'vitest';
import {
  CSV_BOM,
  escapeCsvCell,
  formatCsvAmount,
  neutralizeFormula,
  transactionsToCsv,
} from './export';
import type { Transaction } from '../types';

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't',
  accountId: 'bank',
  categoryId: 'c',
  type: 'EXPENSE',
  amount: 12_500,
  date: '2026-03-07',
  label: 'Café',
  note: null,
  tags: [],
  transferAccountId: null,
  recurringId: null,
  categorySource: null,
  aiConfidence: null,
  createdAt: '2026-03-07T10:00:00.000Z',
  ...over,
});

const lookups = {
  accounts: new Map([
    ['bank', 'BIAT'],
    ['cash', 'Espèces'],
  ]),
  categories: new Map([['c', 'Cafés']]),
};

describe('formatCsvAmount', () => {
  it('virgule décimale, 3 décimales, sans séparateur de milliers', () => {
    expect(formatCsvAmount(-12_500)).toBe('-12,500');
    expect(formatCsvAmount(2_600_000)).toBe('2600,000');
    expect(formatCsvAmount(5)).toBe('0,005');
    expect(formatCsvAmount(0)).toBe('0,000');
  });
});

describe('neutralizeFormula / escapeCsvCell', () => {
  it('préfixe les cellules dangereuses', () => {
    for (const s of ['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx']) {
      expect(neutralizeFormula(s)).toBe(`'${s}`);
    }
    expect(neutralizeFormula('Carrefour')).toBe('Carrefour');
  });

  it('échappe selon RFC 4180', () => {
    expect(escapeCsvCell('simple')).toBe('simple');
    expect(escapeCsvCell('a;b')).toBe('"a;b"');
    expect(escapeCsvCell('dit "bonjour"')).toBe('"dit ""bonjour"""');
    expect(escapeCsvCell('ligne\nsuivante')).toBe('"ligne\nsuivante"');
  });
});

describe('transactionsToCsv', () => {
  it('produit BOM, en-têtes, lignes CRLF', () => {
    const csv = transactionsToCsv(
      [
        tx({ tags: ['travail', 'matin'], note: 'avec "Sami"; payé' }),
        tx({ id: 'i', type: 'INCOME', amount: 2_600_000, label: 'Salaire', categoryId: null }),
        tx({
          id: 'v',
          type: 'TRANSFER',
          amount: 100_000,
          label: 'Retrait DAB',
          categoryId: null,
          transferAccountId: 'cash',
        }),
        tx({ id: 'x', label: '=HYPERLINK("http://x")', accountId: 'unknown', categoryId: 'gone' }),
      ],
      lookups,
    );
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[0]).toBe('Date;Libellé;Montant;Type;Catégorie;Compte;Tags;Note');
    expect(lines[1]).toBe('07/03/2026;Café;-12,500;Dépense;Cafés;BIAT;travail, matin;"avec ""Sami""; payé"');
    expect(lines[2]).toBe('07/03/2026;Salaire;2600,000;Revenu;;BIAT;;');
    expect(lines[3]).toBe('07/03/2026;Retrait DAB;100,000;Virement;;BIAT → Espèces;;');
    expect(lines[4]).toBe(`07/03/2026;"'=HYPERLINK(""http://x"")";-12,500;Dépense;;;;`);
    expect(lines[5]).toBe('');
    expect(lines).toHaveLength(6);
  });

  it('liste vide : en-têtes seuls', () => {
    expect(transactionsToCsv([], lookups)).toBe(
      `${CSV_BOM}Date;Libellé;Montant;Type;Catégorie;Compte;Tags;Note\r\n`,
    );
  });
});
