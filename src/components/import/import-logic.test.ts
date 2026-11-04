import { describe, expect, it } from 'vitest';
import type { Category, ImportPreviewRow } from '@/domain/types';
import { parseCsv } from '@/domain/csv/parse';
import {
  MAX_FILE_BYTES,
  applyCategoryToSelection,
  buildCommitRows,
  buildSampleCsv,
  columnOptions,
  dateSpan,
  decodeCsvBuffer,
  effectiveLabel,
  fileLineNumber,
  filterRows,
  hasCleanableLabels,
  initialEdits,
  isSelectable,
  isSelected,
  mappingProblem,
  mappingStateFrom,
  pageCount,
  plural,
  previewCounts,
  setCategory,
  setSelected,
  toColumnMapping,
  transactionsHref,
  validateCsvFile,
  type MappingState,
} from './import-logic';

function row(index: number, patch: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    index,
    date: '2026-03-10',
    label: `Ligne ${index}`,
    amount: 10_000,
    type: 'EXPENSE',
    importHash: `h${index}`,
    duplicate: 'NONE',
    suggestedCategoryId: null,
    suggestionConfidence: null,
    ...patch,
  };
}

const cat = (id: string, kind: Category['kind']): Category => ({
  id,
  name: id,
  kind,
  group: kind === 'INCOME' ? 'INCOME' : 'NEEDS',
  icon: 'Tag',
  color: '#000000',
  sortOrder: 0,
});

const ROWS = [
  row(0, { suggestedCategoryId: 'courses', suggestionConfidence: 0.9, note: 'n' }),
  row(1, { duplicate: 'EXISTING' }),
  row(2, { duplicate: 'IN_FILE', date: '2026-03-01' }),
  row(3, { type: 'INCOME', date: '2026-03-20' }),
];

describe('mapping', () => {
  const state: MappingState = {
    columns: { date: 0, label: 1, amount: 2, debit: 3, credit: 4, note: null },
    mode: 'single',
    dateFormat: 'DMY',
  };

  it('ne garde que les colonnes du mode choisi', () => {
    expect(toColumnMapping(state)).toMatchObject({ amount: 2, debit: null, credit: null });
    expect(toColumnMapping({ ...state, mode: 'split' })).toMatchObject({
      amount: null,
      debit: 3,
      credit: 4,
    });
  });

  it('déduit le mode depuis un mapping deviné', () => {
    const split = mappingStateFrom({
      date: 0,
      label: 1,
      amount: null,
      debit: 2,
      credit: 3,
      note: null,
      dateFormat: 'DMY',
    });
    expect(split.mode).toBe('split');
    const single = mappingStateFrom({
      date: 0,
      label: 1,
      amount: 2,
      debit: null,
      credit: null,
      note: 4,
      dateFormat: 'YMD',
    });
    expect(single).toEqual({
      columns: { date: 0, label: 1, amount: 2, debit: null, credit: null, note: 4 },
      mode: 'single',
      dateFormat: 'YMD',
    });
  });

  it('signale les mappings incomplets', () => {
    expect(mappingProblem(state)).toBeNull();
    expect(mappingProblem({ ...state, columns: { ...state.columns, label: 0 } })).toMatch(
      /différentes/,
    );
    expect(mappingProblem({ ...state, columns: { ...state.columns, amount: null } })).toMatch(
      /montant/,
    );
    const split: MappingState = {
      ...state,
      mode: 'split',
      columns: { ...state.columns, debit: null, credit: null },
    };
    expect(mappingProblem(split)).toMatch(/débit ou crédit/);
    expect(
      mappingProblem({ ...split, columns: { ...split.columns, debit: 3, credit: 3 } }),
    ).toMatch(/différentes/);
  });

  it('nomme les colonnes', () => {
    expect(
      columnOptions(['Date', ''], ['12/03/2026', 'Un libellé très très long à couper'], true),
    ).toEqual([
      { index: 0, label: 'Date' },
      { index: 1, label: 'Colonne 2 (Un libellé très très lo…)' },
    ]);
    expect(columnOptions(['x'], ['12/03/2026', ''], false)).toEqual([
      { index: 0, label: 'Colonne 1 (12/03/2026)' },
      { index: 1, label: 'Colonne 2' },
    ]);
    expect(fileLineNumber(0, true)).toBe(2);
    expect(fileLineNumber(0, false)).toBe(1);
  });
});

describe('aperçu', () => {
  it('décoche les doublons par défaut et garde la suggestion IA', () => {
    const edits = initialEdits(ROWS);
    expect(edits[0]).toEqual({ selected: true, categoryId: 'courses', categoryFromAI: true });
    expect(edits[1]?.selected).toBe(false);
    expect(edits[2]?.selected).toBe(false);
    expect(previewCounts(ROWS, edits)).toEqual({
      total: 4,
      selected: 2,
      existing: 1,
      inFile: 1,
      possible: 0,
    });
  });

  it('permet de cocher un doublon interne mais jamais un doublon existant', () => {
    const edits = setSelected(initialEdits(ROWS), ROWS, true);
    expect(previewCounts(ROWS, edits).selected).toBe(3);
    expect(edits[1]?.selected).toBe(false);
  });

  it('filtre les lignes', () => {
    const edits = initialEdits(ROWS);
    expect(filterRows(ROWS, edits, 'ALL')).toHaveLength(4);
    expect(filterRows(ROWS, edits, 'TO_IMPORT').map((r) => r.index)).toEqual([0, 3]);
    expect(filterRows(ROWS, edits, 'DUPLICATES').map((r) => r.index)).toEqual([1, 2]);
    expect(filterRows(ROWS, {}, 'TO_IMPORT')).toEqual([]);
  });

  it('une catégorie modifiée n’est plus une suggestion IA', () => {
    const r0 = ROWS[0];
    if (!r0) throw new Error('fixture');
    const edits = setCategory(initialEdits(ROWS), r0, 'restaurants');
    expect(edits[0]).toEqual({ selected: true, categoryId: 'restaurants', categoryFromAI: false });
  });

  it('applique une catégorie à la sélection selon le type', () => {
    const edits = initialEdits(ROWS);
    const expense = applyCategoryToSelection(edits, ROWS, cat('loisirs', 'EXPENSE'));
    expect(expense.applied).toBe(1);
    expect(expense.skipped).toBe(1);
    expect(expense.edits[0]).toMatchObject({ categoryId: 'loisirs', categoryFromAI: false });
    expect(expense.edits[3]?.categoryId).toBeNull();
    const none = applyCategoryToSelection(edits, ROWS, null);
    expect(none.applied).toBe(2);
    expect(none.edits[0]?.categoryId).toBeNull();
  });

  it('prépare les lignes envoyées au serveur', () => {
    const edits = setSelected(initialEdits(ROWS), [ROWS[2] ?? row(9)], true);
    const commit = buildCommitRows(ROWS, edits);
    expect(commit.map((c) => c.index)).toEqual([0, 2, 3]);
    expect(commit[0]).toEqual({
      index: 0,
      date: '2026-03-10',
      label: 'Ligne 0',
      amount: 10_000,
      type: 'EXPENSE',
      note: 'n',
      importHash: 'h0',
      categoryId: 'courses',
      categoryFromAI: true,
    });
    expect(commit[1]).not.toHaveProperty('note');
    expect(commit[1]?.categoryFromAI).toBe(false);
  });

  it('doublon possible : décoché par défaut mais cochable, compté à part', () => {
    const rows = [row(0), row(1, { duplicate: 'POSSIBLE' })];
    const edits = initialEdits(rows);
    expect(isSelected(edits, rows[1] ?? row(9))).toBe(false);
    expect(isSelectable(rows[1] ?? row(9))).toBe(true);
    const checked = setSelected(edits, rows, true);
    expect(buildCommitRows(rows, checked).map((c) => c.index)).toEqual([0, 1]);
    expect(previewCounts(rows, edits)).toMatchObject({ possible: 1, inFile: 0, selected: 1 });
    expect(filterRows(rows, edits, 'DUPLICATES').map((r) => r.index)).toEqual([1]);
  });

  it('nettoie les libellés à l’envoi si l’option est active', () => {
    const rows = [
      row(0, { label: 'CB CARREFOUR 12/03', suggestedLabel: 'Carrefour' }),
      row(1, { label: 'Café', suggestedLabel: 'Café' }),
      row(2),
    ];
    const edits = initialEdits(rows);
    expect(hasCleanableLabels(rows)).toBe(true);
    expect(hasCleanableLabels([row(5)])).toBe(false);
    expect(buildCommitRows(rows, edits, { cleanLabels: true }).map((c) => c.label)).toEqual([
      'Carrefour',
      'Café',
      'Ligne 2',
    ]);
    expect(buildCommitRows(rows, edits).map((c) => c.label)).toEqual([
      'CB CARREFOUR 12/03',
      'Café',
      'Ligne 2',
    ]);
    expect(effectiveLabel(rows[0] ?? row(9), false)).toBe('CB CARREFOUR 12/03');
  });

  it('calcule l’intervalle et le lien vers les transactions', () => {
    expect(dateSpan([])).toBeNull();
    const span = dateSpan(ROWS);
    expect(span).toEqual({ from: '2026-03-01', to: '2026-03-20' });
    expect(transactionsHref(span)).toBe('/transactions?from=2026-03-01&to=2026-03-20');
    expect(transactionsHref(null)).toBe('/transactions');
  });

  it('pagine et accorde', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(100)).toBe(1);
    expect(pageCount(101)).toBe(2);
    expect(plural(1, 'transaction')).toBe('1 transaction');
    expect(plural(3, 'transaction')).toBe('3 transactions');
    expect(plural(2, 'ligne en erreur', 'lignes en erreur')).toBe('2 lignes en erreur');
  });
});

describe('fichier', () => {
  it('valide nom, type et taille', () => {
    expect(validateCsvFile({ name: 'releve.csv', size: 10, type: '' })).toBeNull();
    expect(validateCsvFile({ name: 'export', size: 10, type: 'text/csv' })).toBeNull();
    expect(validateCsvFile({ name: 'releve.pdf', size: 10, type: 'application/pdf' })).toMatch(
      /pas un CSV/,
    );
    expect(validateCsvFile({ name: 'releve.csv', size: 0, type: 'text/csv' })).toBe(
      'Le fichier est vide.',
    );
    expect(
      validateCsvFile({ name: 'releve.csv', size: MAX_FILE_BYTES + 1, type: 'text/csv' }),
    ).toMatch(/5 Mo/);
  });

  it('décode en UTF-8 puis se replie sur Windows-1252', () => {
    const utf8 = new TextEncoder().encode('Libellé;Débit');
    expect(decodeCsvBuffer(utf8.buffer)).toEqual({ text: 'Libellé;Débit', encoding: 'UTF-8' });
    // « é » en Windows-1252 = 0xE9, invalide seul en UTF-8.
    const cp1252 = new Uint8Array([0x4c, 0x69, 0x62, 0x65, 0x6c, 0x6c, 0xe9]);
    expect(decodeCsvBuffer(cp1252.buffer)).toEqual({ text: 'Libellé', encoding: 'Windows-1252' });
  });

  it('génère un exemple lisible par le parseur', () => {
    const csv = buildSampleCsv(['2026-03-01', '2026-03-05']);
    expect(csv.startsWith('﻿Date;Libellé;Débit;Crédit;Note\r\n01/03/2026;VIR RECU SALAIRE')).toBe(
      true,
    );
    const parsed = parseCsv(csv);
    expect(parsed.ok && parsed.value.rows.length).toBe(8);
    expect(buildSampleCsv([])).toBe('﻿Date;Libellé;Débit;Crédit;Note\r\n');
  });
});
