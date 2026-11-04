import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  applyMapping,
  detectDateFormat,
  guessMapping,
  hasHeaderRow,
  normalizeHeader,
  parseAmountCell,
  parseDateCell,
  type ColumnMapping,
} from './mapping';
import { parseCsv } from './parse';

function load(name: string) {
  const text = readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf-8');
  const r = parseCsv(text);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

const base: ColumnMapping = {
  date: 0,
  label: 1,
  amount: 2,
  debit: null,
  credit: null,
  note: null,
  dateFormat: 'DMY',
};

describe('normalizeHeader', () => {
  it('retire accents, casse et ponctuation', () => {
    expect(normalizeHeader('  Date opération (TND) ')).toBe('date operation tnd');
    expect(normalizeHeader('Libellé')).toBe('libelle');
    expect(normalizeHeader('DÉBIT')).toBe('debit');
  });
});

describe('parseDateCell', () => {
  it.each([
    ['12/03/2026', '2026-03-12'],
    ['12-03-26', '2026-03-12'],
    ['12.03.2026', '2026-03-12'],
    ['1/3/2026', '2026-03-01'],
    ['2026-03-12', '2026-03-12'],
    ['2026/03/12', '2026-03-12'],
    ['20260312', '2026-03-12'],
    ['12/03/2026 10:45', '2026-03-12'],
    ['2026-03-12T10:45:00Z', '2026-03-12'],
    ['"12/03/2026"', '2026-03-12'],
    ['29/02/2024', '2024-02-29'],
  ])('DMY : %s → %s', (raw, expected) => {
    expect(parseDateCell(raw, 'DMY')).toBe(expected);
  });

  it('applique les formats MDY et YMD', () => {
    expect(parseDateCell('03/12/2026', 'MDY')).toBe('2026-03-12');
    expect(parseDateCell('26-03-12', 'YMD')).toBe('2026-03-12');
    // Une année sur 4 chiffres en tête l'emporte toujours.
    expect(parseDateCell('2026-03-12', 'MDY')).toBe('2026-03-12');
  });

  it.each([
    '',
    '   ',
    '31/02/2026',
    '29/02/2026',
    '12/13/2026',
    '00/03/2026',
    '12/03/202',
    '12/03/6',
    '123/03/2026',
    '12/03/1850',
    'hier',
    '12 mars 2026',
    '20261312',
  ])('refuse « %s »', (raw) => {
    expect(parseDateCell(raw, 'DMY')).toBeNull();
  });
});

describe('detectDateFormat', () => {
  it('reconnaît les formats', () => {
    expect(detectDateFormat(['2026-03-12', '2026-03-13'])).toBe('YMD');
    expect(detectDateFormat(['20260312'])).toBe('YMD');
    expect(detectDateFormat(['01/03/2026', '25/03/2026'])).toBe('DMY');
    expect(detectDateFormat(['03/01/2026', '03/25/2026'])).toBe('MDY');
  });

  it('choisit DMY en cas d’ambiguïté ou sans données', () => {
    expect(detectDateFormat(['01/02/2026', '03/04/2026'])).toBe('DMY');
    expect(detectDateFormat([])).toBe('DMY');
    expect(detectDateFormat(['n/a', ''])).toBe('DMY');
    expect(detectDateFormat(['13/01/2026', '01/13/2026'])).toBe('DMY');
  });
});

describe('parseAmountCell', () => {
  it.each([
    ['-1 234,500', -1_234_500],
    ['1 234,500', 1_234_500],
    ['1 234,500', 1_234_500],
    ['1 234,5', 1_234_500],
    ['1.234,500', 1_234_500],
    ['-1.234.567,89', -1_234_567_890],
    ['1,234.50', 1_234_500],
    ['1,234,567', 1_234_567_000],
    ['1.234.567', 1_234_567_000],
    ["1'234.50", 1_234_500],
    ['1.234', 1_234],
    ['12.5', 12_500],
    ['12,5', 12_500],
    ['45,000', 45_000],
    ['45', 45_000],
    [',5', 500],
    ['5,', 5_000],
    ['(45,000)', -45_000],
    ['(-45)', 45_000],
    ['45,000 DT', 45_000],
    ['-45,000 TND', -45_000],
    ['DT 12', 12_000],
    ['TND -12,5', -12_500],
    ['12 dinars', 12_000],
    ['€ 3.20', 3_200],
    ['−12', -12_000],
    ['–7,25', -7_250],
    ['+12', 12_000],
    ['12-', -12_000],
    ['"−3,500"', -3_500],
    ['12.3456', 12_346],
    ['0,9995', 1_000],
    ['0,000', 0],
    ['-0', 0],
  ])('« %s » → %d', (raw, expected) => {
    expect(parseAmountCell(raw)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    '-',
    'douze',
    '12abc',
    '1.2.3,4',
    '1,2,3',
    '12,3,4',
    '1.23,4,5',
    '12 DTX',
    '1e5',
  ])('refuse « %s »', (raw) => {
    expect(parseAmountCell(raw)).toBeNull();
  });

  it('refuse un montant hors des entiers sûrs', () => {
    expect(parseAmountCell('99999999999999999999')).toBeNull();
  });
});

describe('hasHeaderRow', () => {
  it('reconnaît une ligne d’en-têtes', () => {
    expect(hasHeaderRow(['Date', 'Libellé', 'Montant'])).toBe(true);
  });

  it('reconnaît une ligne de données', () => {
    expect(hasHeaderRow(['12/03/2026', 'Café', '-3,5'])).toBe(false);
    expect(hasHeaderRow(['Café', '-3,5'])).toBe(false);
    expect(hasHeaderRow(['', ' '])).toBe(false);
    expect(hasHeaderRow(['123', '456'])).toBe(false);
  });
});

describe('guessMapping', () => {
  it('fixture BIAT : débit / crédit, date d’opération, solde ignoré', () => {
    const { headers, rows } = load('biat.csv');
    expect(guessMapping(headers, rows)).toEqual({
      date: 0,
      label: 2,
      amount: null,
      debit: 3,
      credit: 4,
      note: null,
      dateFormat: 'DMY',
    });
  });

  it('fixture montant signé avec virgule', () => {
    const { headers, rows } = load('signed-comma.csv');
    expect(guessMapping(headers, rows)).toEqual({ ...base, note: 3 });
  });

  it('fixture anglaise ISO', () => {
    const { headers, rows } = load('english-iso.csv');
    expect(guessMapping(headers, rows)).toEqual({ ...base, note: 3, dateFormat: 'YMD' });
  });

  it('reconnaît les variantes françaises et anglaises', () => {
    expect(
      guessMapping(['Date valeur', 'Opération', 'Retrait', 'Versement', 'Référence'], []),
    ).toMatchObject({ date: 0, label: 1, debit: 2, credit: 3, amount: null, note: 4 });
    expect(
      guessMapping(['Transaction Date', 'Payee', 'Paid out', 'Paid in', 'Memo'], []),
    ).toMatchObject({
      date: 0,
      label: 1,
      debit: 2,
      credit: 3,
      note: 4,
    });
    expect(guessMapping(['Montant (TND)', 'Date', 'Description', 'Commentaire'], [])).toMatchObject(
      {
        date: 1,
        label: 2,
        amount: 0,
        note: 3,
      },
    );
  });

  it('préfère la date d’opération à la date de valeur', () => {
    const m = guessMapping(['Date valeur', 'Date opération', 'Libellé', 'Montant'], []);
    expect(m.date).toBe(1);
    expect(m.amount).toBe(3);
  });

  it('devine sans en-têtes à partir du contenu', () => {
    const sample = [
      ['CARREFOUR MARSA', '12/03/2026', '-87,450', ''],
      ['SALAIRE MARS', '13/03/2026', '2 600,000', ''],
      ['CAFE', '25/03/2026', '-3,500', ''],
    ];
    expect(guessMapping(['', '', '', ''], sample)).toEqual({
      date: 1,
      label: 0,
      amount: 2,
      debit: null,
      credit: null,
      note: null,
      dateFormat: 'DMY',
    });
  });

  it('préfère une colonne de montant signé à un débit seul', () => {
    const m = guessMapping(
      ['Date', 'Libellé', 'Débit', 'Valeur'],
      [
        ['01/03/2026', 'Café', '', '-3,5'],
        ['02/03/2026', 'Taxi', '', '-7'],
      ],
    );
    expect(m).toMatchObject({ amount: 3, debit: null, credit: null });
  });

  it('accepte une colonne de débit seule à défaut de mieux', () => {
    const m = guessMapping(['Date', 'Libellé', 'Débit'], [['01/03/2026', 'Café', '3,5']]);
    expect(m).toMatchObject({ amount: null, debit: 2, credit: null });
  });

  it('se rabat sur des colonnes par défaut si rien ne correspond', () => {
    expect(guessMapping(['x', 'y'], [])).toMatchObject({ date: 0, label: 1, amount: null });
    expect(guessMapping([], [])).toMatchObject({ date: 0, label: 0 });
    // Date trouvée en colonne 1 par le contenu, aucun texte : libellé sur la première colonne libre.
    expect(guessMapping(['a', 'b'], [['5', '12/03/2026']])).toMatchObject({ date: 1, label: 0 });
  });
});

describe('applyMapping', () => {
  it('fixture BIAT : types, montants et erreurs', () => {
    const { headers, rows } = load('biat.csv');
    const r = applyMapping(rows, guessMapping(headers, rows));
    expect(r.rows).toEqual([
      {
        index: 0,
        date: '2026-03-02',
        label: 'PAIEMENT CB CARREFOUR LA MARSA 02/03',
        amount: 87_450,
        type: 'EXPENSE',
      },
      {
        index: 1,
        date: '2026-03-05',
        label: 'VIR RECU SALAIRE MARS 2026',
        amount: 2_600_000,
        type: 'INCOME',
      },
      {
        index: 2,
        date: '2026-03-06',
        label: 'RETRAIT DAB BIAT LAC 2',
        amount: 200_000,
        type: 'EXPENSE',
      },
      {
        index: 3,
        date: '2026-03-10',
        label: 'PRLV STEG FACTURE 123456',
        amount: 1_234_500,
        type: 'EXPENSE',
      },
    ]);
    expect(r.errors).toEqual([
      { index: 4, message: 'Ni débit ni crédit renseigné.' },
      { index: 5, message: 'Date manquante.' },
    ]);
  });

  it('fixture montant signé : signe, parenthèses, devise, notes', () => {
    const { headers, rows } = load('signed-comma.csv');
    const r = applyMapping(rows, guessMapping(headers, rows));
    expect(r.rows).toEqual([
      {
        index: 0,
        date: '2026-03-12',
        label: 'Café Chez Ali',
        amount: 3_500,
        type: 'EXPENSE',
        note: 'matin',
      },
      { index: 1, date: '2026-03-13', label: 'Salaire', amount: 2_400_000, type: 'INCOME' },
      {
        index: 2,
        date: '2026-03-14',
        label: 'Remboursement Sami',
        amount: 12_500,
        type: 'EXPENSE',
        note: 'dette',
      },
      { index: 3, date: '2026-03-15', label: 'Achat TV Mytek', amount: 1_234_500, type: 'EXPENSE' },
      {
        index: 4,
        date: '2026-03-16',
        label: 'Vente vélo',
        amount: 35_000,
        type: 'INCOME',
        note: 'Leboncoin',
      },
    ]);
    expect(r.errors).toEqual([
      { index: 5, message: 'Date illisible : « 31-02-26 ».' },
      { index: 6, message: 'Montant illisible : « douze ».' },
    ]);
  });

  it('fixture anglaise ISO', () => {
    const { headers, rows } = load('english-iso.csv');
    const r = applyMapping(rows, guessMapping(headers, rows));
    expect(r.errors).toEqual([]);
    expect(r.rows.map((x) => [x.date, x.label, x.amount, x.type, x.note])).toEqual([
      ['2026-03-01', 'Netflix subscription', 35_000, 'EXPENSE', undefined],
      ['2026-03-02', 'Rent, March', 1_234_500, 'EXPENSE', 'flat'],
      ['2026-03-03', 'Freelance invoice #42', 1_500_000, 'INCOME', 'client A'],
      ['2026-03-04', 'Coffee', 3_750, 'EXPENSE', undefined],
      ['2026-03-05', 'Refund', 12_500, 'INCOME', undefined],
    ]);
  });

  it('fixture guillemets : retours à la ligne aplatis, lignes irrégulières', () => {
    const { headers, rows } = load('quoted-multiline.csv');
    const r = applyMapping(rows, guessMapping(headers, rows));
    expect(r.rows.map((x) => [x.label, x.amount, x.type, x.note])).toEqual([
      ['Restaurant "Le Golfe"', 78_000, 'EXPENSE', 'dîner "anniversaire"'],
      ['Courses Monoprix Ennasr', 45_300, 'EXPENSE', 'ligne 1 ligne 2'],
      ['Virement; Sami', 150_000, 'INCOME', undefined],
      ['Ooredoo internet', 49_000, 'EXPENSE', undefined],
    ]);
    expect(r.errors).toEqual([{ index: 4, message: 'Montant manquant ou nul.' }]);
  });

  it('signale les lignes incomplètes et ignore les lignes vides', () => {
    const r = applyMapping([['12/03/2026'], ['', ' '], ['12/03/2026', 'Café', '-3']], base);
    expect(r.errors).toEqual([{ index: 0, message: 'Ligne incomplète : 1 colonne(s) seulement.' }]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.index).toBe(2);
  });

  it('valide libellé et montant', () => {
    const r = applyMapping(
      [
        ['12/03/2026', '   ', '-3'],
        ['12/03/2026', 'Café', '0,000'],
        ['12/03/2026', 'Énorme', '2 000 000 000'],
      ],
      base,
    );
    expect(r.errors.map((e) => e.message)).toEqual([
      'Libellé vide.',
      'Montant manquant ou nul.',
      'Montant trop élevé.',
    ]);
  });

  it('tronque libellé et note aux longueurs autorisées', () => {
    const long = 'x'.repeat(300);
    const r = applyMapping([['12/03/2026', long, '-3', 'n'.repeat(800)]], { ...base, note: 3 });
    expect(r.rows[0]?.label).toHaveLength(140);
    expect(r.rows[0]?.note).toHaveLength(500);
  });

  it('mode débit / crédit : erreurs et cas limites', () => {
    const split: ColumnMapping = { ...base, amount: null, debit: 2, credit: 3 };
    const r = applyMapping(
      [
        ['01/03/2026', 'A', '10', '20'],
        ['01/03/2026', 'B', 'x', ''],
        ['01/03/2026', 'C', '', 'y'],
        ['01/03/2026', 'D', '-12,5', ''],
        ['01/03/2026', 'E', '', '-4'],
        ['01/03/2026', 'F', '0', '7'],
      ],
      split,
    );
    expect(r.errors).toEqual([
      { index: 0, message: 'Débit et crédit renseignés sur la même ligne.' },
      { index: 1, message: 'Débit illisible : « x ».' },
      { index: 2, message: 'Crédit illisible : « y ».' },
    ]);
    expect(r.rows.map((x) => [x.label, x.amount, x.type])).toEqual([
      ['D', 12_500, 'EXPENSE'],
      ['E', 4_000, 'EXPENSE'],
      ['F', 7_000, 'INCOME'],
    ]);
  });

  it('mode débit seul ou crédit seul', () => {
    const debitOnly = applyMapping([['01/03/2026', 'A', '5']], { ...base, amount: null, debit: 2 });
    expect(debitOnly.rows[0]?.type).toBe('EXPENSE');
    const creditOnly = applyMapping([['01/03/2026', 'A', '5']], {
      ...base,
      amount: null,
      credit: 2,
    });
    expect(creditOnly.rows[0]?.type).toBe('INCOME');
  });

  it('signale l’absence de colonne de montant', () => {
    const r = applyMapping([['01/03/2026', 'A', '5']], { ...base, amount: null });
    expect(r.errors).toEqual([{ index: 0, message: 'Aucune colonne de montant sélectionnée.' }]);
  });

  it('respecte le format de date choisi', () => {
    const r = applyMapping([['03/12/2026', 'A', '5']], { ...base, dateFormat: 'MDY' });
    expect(r.rows[0]?.date).toBe('2026-03-12');
  });

  it('traite une cellule de montant absente comme vide', () => {
    const r = applyMapping([['01/03/2026', 'A']], base);
    expect(r.errors).toEqual([{ index: 0, message: 'Montant manquant ou nul.' }]);
  });

  it('ignore une note vide', () => {
    const r = applyMapping([['01/03/2026', 'A', '5', '  ']], { ...base, note: 3 });
    expect(r.rows[0]).not.toHaveProperty('note');
  });
});
