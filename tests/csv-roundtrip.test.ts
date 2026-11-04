// Aller-retour CSV : export (src/domain/csv/export.ts) puis relecture (parse.ts + mapping.ts).
import { describe, expect, it } from 'vitest';
import { CSV_BOM, CSV_HEADERS, transactionsToCsv } from '@/domain/csv/export';
import { detectDelimiter, findIrregularRows, parseCsv } from '@/domain/csv/parse';
import { applyMapping, guessMapping, MAX_LABEL_LENGTH } from '@/domain/csv/mapping';
import { computeImportHash } from '@/domain/csv/hash';
import { addDays } from '@/domain/dates';
import { MAX_AMOUNT_MILLIMES } from '@/domain/money';
import type { Transaction } from '@/domain/types';
import { mulberry32, pick, randInt } from './helpers/finance-fixtures';

const LOOKUPS = {
  accounts: new Map([
    ['acc_bank', 'BIAT'],
    ['acc_cash', 'Espèces'],
  ]),
  categories: new Map([
    ['cat_courses', 'Courses'],
    ['cat_salaire', 'Salaire'],
    ['cat_formule', '=HYPERLINK("http://x")'],
  ]),
};

let seq = 0;
function txn(
  p: Partial<Transaction> & Pick<Transaction, 'label' | 'amount' | 'type'>,
): Transaction {
  seq++;
  return {
    id: `t${seq}`,
    accountId: 'acc_bank',
    categoryId: null,
    date: '2026-03-12',
    note: null,
    tags: [],
    transferAccountId: null,
    recurringId: null,
    categorySource: null,
    aiConfidence: null,
    createdAt: '2026-03-12T10:00:00.000Z',
    ...p,
  };
}

/** Exporte puis relit le CSV, avec la devinette de colonnes de l'écran d'import. */
function roundTrip(rows: Transaction[]) {
  const csv = transactionsToCsv(rows, LOOKUPS);
  const parsed = parseCsv(csv);
  if (!parsed.ok) throw new Error(parsed.error);
  const { headers, rows: cells } = parsed.value;
  const mapping = guessMapping(headers, cells.slice(0, 20));
  const mapped = applyMapping(cells, mapping);
  return { csv, headers, cells, mapping, ...mapped };
}

const LABELS = [
  'CARREFOUR LA MARSA',
  'Café ; croissant',
  'Restaurant "Le Golfe"',
  'Ligne 1\nLigne 2',
  'Retour\r\nchariot',
  '  espaces   multiples  ',
  'Épicerie àéèçù',
  'سوق',
  ';;;',
  '""',
  'Pâtisserie, gâteaux',
  'Tab\tinside',
];

describe('export → re-parse : mêmes dates, montants et types', () => {
  it('jeu de 500 transactions pseudo-aléatoires (graine fixe)', () => {
    const rand = mulberry32(31337);
    const rows: Transaction[] = [];
    for (let i = 0; i < 500; i++) {
      const type = pick(rand, ['EXPENSE', 'INCOME'] as const);
      rows.push(
        txn({
          type,
          amount: rand() < 0.05 ? 1 : randInt(rand, 1, 999_999_999),
          date: addDays('2023-12-25', randInt(rand, 0, 1200)),
          label: `${pick(rand, LABELS)} ${i}`,
          categoryId: type === 'INCOME' ? 'cat_salaire' : 'cat_courses',
          accountId: pick(rand, ['acc_bank', 'acc_cash']),
          note: rand() < 0.3 ? `note ; "${i}"\nsuite` : null,
          tags: rand() < 0.3 ? ['vacances', 'famille'] : [],
        }),
      );
    }
    const { rows: back, errors, headers, mapping, cells } = roundTrip(rows);
    expect(errors).toEqual([]);
    expect(headers).toEqual([...CSV_HEADERS]);
    expect(mapping.amount).toBe(CSV_HEADERS.indexOf('Montant'));
    expect(mapping.label).toBe(CSV_HEADERS.indexOf('Libellé'));
    expect(mapping.date).toBe(CSV_HEADERS.indexOf('Date'));
    expect(mapping.dateFormat).toBe('DMY');
    expect(findIrregularRows(headers, cells)).toEqual([]);
    expect(back).toHaveLength(rows.length);
    back.forEach((r, i) => {
      const src = rows[i];
      if (!src) throw new Error('ligne manquante');
      expect(r.index).toBe(i);
      expect(r.date).toBe(src.date);
      expect(r.amount).toBe(src.amount);
      expect(Number.isSafeInteger(r.amount)).toBe(true);
      expect(r.type).toBe(src.type);
      // Le libellé relu est celui d'origine, espaces et retours ligne normalisés.
      expect(r.label).toBe(src.label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH));
      if (src.note !== null) expect(r.note).toBe(src.note.replace(/\s+/g, ' ').trim());
      else expect(r.note).toBeUndefined();
    });
  });

  it('le hash d’import est stable après un aller-retour (dédoublonnage idempotent)', () => {
    const rows = [
      txn({ type: 'EXPENSE', amount: 87_250, label: 'PAIEMENT CB CARREFOUR 12/03' }),
      txn({ type: 'INCOME', amount: 2_600_000, label: 'VIREMENT SALAIRE', date: '2026-03-01' }),
    ];
    const once = roundTrip(rows).rows;
    const reExported = once.map((r) =>
      txn({ type: r.type, amount: r.amount, label: r.label, date: r.date }),
    );
    const twice = roundTrip(reExported).rows;
    const hashes = (list: typeof once) =>
      list.map((r) =>
        computeImportHash({ date: r.date, amount: r.amount, type: r.type, label: r.label }),
      );
    expect(hashes(twice)).toEqual(hashes(once));
  });

  it('montants limites : 1 millime, 999,999 DT, plafond métier', () => {
    const amounts = [1, 999, 1000, 999_999, MAX_AMOUNT_MILLIMES];
    const rows = amounts.map((amount) => txn({ type: 'EXPENSE', amount, label: `M${amount}` }));
    const { rows: back, csv, errors } = roundTrip(rows);
    expect(errors).toEqual([]);
    expect(back.map((r) => r.amount)).toEqual(amounts);
    expect(csv).toContain(';-0,001;');
    expect(csv).toContain(';-999999,999;');
  });

  it('au-delà du plafond métier : ligne refusée à la relecture (« Montant trop élevé »)', () => {
    const { rows: back, errors } = roundTrip([
      txn({ type: 'INCOME', amount: MAX_AMOUNT_MILLIMES + 1, label: 'Trop' }),
    ]);
    expect(back).toEqual([]);
    expect(errors).toEqual([{ index: 0, message: 'Montant trop élevé.' }]);
  });

  it('dates limites : 29 février bissextile, 31 décembre, 1er janvier', () => {
    const dates = ['2024-02-29', '2028-02-29', '2025-12-31', '2026-01-01'];
    const { rows: back } = roundTrip(
      dates.map((date) => txn({ type: 'INCOME', amount: 1000, label: 'x', date })),
    );
    expect(back.map((r) => r.date)).toEqual(dates);
  });

  it('virements : exportés en positif, relus comme revenus (l’import ne connaît pas les virements)', () => {
    const t = txn({
      type: 'TRANSFER',
      amount: 200_000,
      label: 'Retrait DAB',
      transferAccountId: 'acc_cash',
    });
    const { rows: back, csv } = roundTrip([t]);
    expect(csv).toContain('BIAT → Espèces');
    expect(csv).toContain(';Virement;');
    expect(back[0]?.type).toBe('INCOME');
    expect(back[0]?.amount).toBe(200_000);
  });
});

describe('sécurité et format du fichier exporté', () => {
  it('BOM UTF-8, séparateur « ; », CRLF ; le BOM est ignoré à la relecture', () => {
    const csv = transactionsToCsv([txn({ type: 'EXPENSE', amount: 3500, label: 'Café' })], LOOKUPS);
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(detectDelimiter(csv)).toBe(';');
    const parsed = parseCsv(csv);
    expect(parsed.ok && parsed.value.headers[0]).toBe('Date');
    // Double BOM accidentel : seul le premier est retiré, l'en-tête reste reconnaissable.
    const doubled = parseCsv(CSV_BOM + csv);
    expect(doubled.ok).toBe(true);
  });

  it('injection de formules neutralisée dans toutes les colonnes texte', () => {
    const evil = ['=1+1', '+SUM(A1:A9)', '-2+3', '@cmd', '\tTAB', '\rCR', '=HYPERLINK("http://x")'];
    const rows = evil.map((label) =>
      txn({
        type: 'EXPENSE',
        amount: 1000,
        label,
        note: label,
        categoryId: 'cat_formule',
        tags: [label.trim()],
      }),
    );
    const { csv, cells } = roundTrip(rows);
    const parsed = parseCsv(csv);
    if (!parsed.ok) throw new Error(parsed.error);
    for (const row of parsed.value.rows) {
      const [date, label, amount, type, cat, account, tags, note] = row;
      for (const cell of [date, label, type, cat, account, tags, note]) {
        expect(cell ?? '', `cellule « ${cell} »`).not.toMatch(/^[=+\-@\t\r]/);
      }
      // La colonne Montant reste un nombre signé lisible.
      expect(amount).toBe('-1,000');
    }
    expect(cells).toHaveLength(evil.length);
  });

  it('libellés avec « ; », guillemets et retours ligne : une seule ligne logique chacun', () => {
    const rows = LABELS.map((label) => txn({ type: 'EXPENSE', amount: 12_500, label }));
    const { cells, rows: back, errors } = roundTrip(rows);
    expect(cells.every((c) => c.length === CSV_HEADERS.length)).toBe(true);
    // « ;;; » et « "" » restent des libellés non vides ; tous relus.
    expect(errors).toEqual([]);
    expect(back).toHaveLength(LABELS.length);
    expect(back[1]?.label).toBe('Café ; croissant');
    expect(back[2]?.label).toBe('Restaurant "Le Golfe"');
    expect(back[3]?.label).toBe('Ligne 1 Ligne 2');
    expect(back[9]?.label).toBe('""');
  });

  it('libellé trop long : tronqué à la longueur acceptée par le serveur', () => {
    const label = 'A'.repeat(500);
    const { rows: back } = roundTrip([txn({ type: 'EXPENSE', amount: 1, label })]);
    expect(back[0]?.label).toHaveLength(MAX_LABEL_LENGTH);
  });

  it('export vide : en-têtes seuls, relecture sans ligne', () => {
    const { rows: back, errors, csv } = roundTrip([]);
    expect(csv).toBe(`${CSV_BOM}${CSV_HEADERS.join(';')}\r\n`);
    expect(back).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('catégorie ou compte inconnus : cellules vides, pas de « undefined »', () => {
    const csv = transactionsToCsv(
      [
        txn({ type: 'EXPENSE', amount: 1000, label: 'x', categoryId: 'inconnue', accountId: 'zz' }),
        txn({ type: 'TRANSFER', amount: 1000, label: 'y', transferAccountId: 'zz' }),
      ],
      LOOKUPS,
    );
    expect(csv).not.toContain('undefined');
    expect(csv).toContain('BIAT → ;');
  });
});
