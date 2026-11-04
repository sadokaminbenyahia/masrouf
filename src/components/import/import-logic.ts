/**
 * Logique pure de l'assistant d'import (sans React) : options de colonnes, mapping,
 * sélection des lignes de l'aperçu, préparation de l'envoi et lien vers les transactions.
 */
import type { ColumnMapping, DateFormat } from '@/domain/csv/mapping';
import type { DateRange, ISODate } from '@/domain/dates';
import type { Category, ImportPreviewRow } from '@/domain/types';
import type { ImportCommitInput } from '@/lib/schemas/import';

/** Taille maximale d'un fichier importé. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Lignes par page dans l'aperçu. */
export const PREVIEW_PAGE_SIZE = 100;

export type AmountMode = 'single' | 'split';

/** Colonnes choisies par l'utilisateur ; on garde les deux modes pour ne rien perdre en basculant. */
export interface ColumnChoice {
  date: number;
  label: number;
  amount: number | null;
  debit: number | null;
  credit: number | null;
  note: number | null;
}

export interface MappingState {
  columns: ColumnChoice;
  mode: AmountMode;
  dateFormat: DateFormat;
}

export function mappingStateFrom(m: ColumnMapping): MappingState {
  return {
    columns: {
      date: m.date,
      label: m.label,
      amount: m.amount,
      debit: m.debit,
      credit: m.credit,
      note: m.note,
    },
    mode: m.amount === null && (m.debit !== null || m.credit !== null) ? 'split' : 'single',
    dateFormat: m.dateFormat,
  };
}

export function toColumnMapping(state: MappingState): ColumnMapping {
  const { columns, mode, dateFormat } = state;
  return {
    date: columns.date,
    label: columns.label,
    amount: mode === 'single' ? columns.amount : null,
    debit: mode === 'split' ? columns.debit : null,
    credit: mode === 'split' ? columns.credit : null,
    note: columns.note,
    dateFormat,
  };
}

/** Message bloquant pour le mapping, ou null s'il est complet. */
export function mappingProblem(state: MappingState): string | null {
  const { columns, mode } = state;
  if (columns.date === columns.label)
    return 'La date et le libellé doivent venir de colonnes différentes.';
  if (mode === 'single' && columns.amount === null) return 'Choisissez la colonne du montant.';
  if (mode === 'split' && columns.debit === null && columns.credit === null) {
    return 'Choisissez au moins une colonne débit ou crédit.';
  }
  if (mode === 'split' && columns.debit !== null && columns.debit === columns.credit) {
    return 'Le débit et le crédit doivent venir de colonnes différentes.';
  }
  return null;
}

export interface ColumnOption {
  index: number;
  label: string;
}

/** Libellés des colonnes : l'en-tête s'il existe, sinon « Colonne N (exemple) ». */
export function columnOptions(
  headers: readonly string[],
  firstRow: readonly string[] | undefined,
  hasHeader: boolean,
): ColumnOption[] {
  const width = Math.max(headers.length, firstRow?.length ?? 0);
  return Array.from({ length: width }, (_, index) => {
    const header = hasHeader ? (headers[index] ?? '').trim() : '';
    if (header !== '') return { index, label: header };
    const example = (firstRow?.[index] ?? '').trim();
    const short = example.length > 24 ? `${example.slice(0, 23)}…` : example;
    return { index, label: short ? `Colonne ${index + 1} (${short})` : `Colonne ${index + 1}` };
  });
}

/** Numéro de ligne affiché à l'utilisateur (1 = première ligne du fichier). */
export function fileLineNumber(index: number, hasHeader: boolean): number {
  return index + (hasHeader ? 2 : 1);
}

// ───────────────────────── Aperçu ─────────────────────────

export interface RowEdit {
  selected: boolean;
  categoryId: string | null;
  /** La catégorie est la suggestion de l'IA, non modifiée */
  categoryFromAI: boolean;
}

export type RowEdits = Record<number, RowEdit>;

export type PreviewFilter = 'ALL' | 'TO_IMPORT' | 'DUPLICATES';

/**
 * Les doublons existants ne sont jamais importables ; les doublons internes au fichier et les
 * doublons possibles le sont (décochés par défaut, voir `initialEdits`).
 */
export function isSelectable(row: ImportPreviewRow): boolean {
  return row.duplicate !== 'EXISTING';
}

export function initialEdits(rows: readonly ImportPreviewRow[]): RowEdits {
  const edits: RowEdits = {};
  for (const row of rows) {
    edits[row.index] = {
      selected: row.duplicate === 'NONE',
      categoryId: row.suggestedCategoryId,
      categoryFromAI: row.suggestedCategoryId !== null,
    };
  }
  return edits;
}

export function editOf(edits: RowEdits, row: ImportPreviewRow): RowEdit {
  return (
    edits[row.index] ?? {
      selected: false,
      categoryId: row.suggestedCategoryId,
      categoryFromAI: row.suggestedCategoryId !== null,
    }
  );
}

export function isSelected(edits: RowEdits, row: ImportPreviewRow): boolean {
  return isSelectable(row) && editOf(edits, row).selected;
}

export function filterRows(
  rows: readonly ImportPreviewRow[],
  edits: RowEdits,
  filter: PreviewFilter,
): ImportPreviewRow[] {
  switch (filter) {
    case 'ALL':
      return [...rows];
    case 'TO_IMPORT':
      return rows.filter((r) => isSelected(edits, r));
    case 'DUPLICATES':
      return rows.filter((r) => r.duplicate !== 'NONE');
  }
}

export interface PreviewCounts {
  total: number;
  selected: number;
  existing: number;
  inFile: number;
  /** Doublons possibles : même montant et type à ±2 jours, libellé différent */
  possible: number;
}

export function previewCounts(rows: readonly ImportPreviewRow[], edits: RowEdits): PreviewCounts {
  let selected = 0;
  let existing = 0;
  let inFile = 0;
  let possible = 0;
  for (const row of rows) {
    if (isSelected(edits, row)) selected++;
    if (row.duplicate === 'EXISTING') existing++;
    if (row.duplicate === 'IN_FILE') inFile++;
    if (row.duplicate === 'POSSIBLE') possible++;
  }
  return { total: rows.length, selected, existing, inFile, possible };
}

export function setSelected(
  edits: RowEdits,
  rows: readonly ImportPreviewRow[],
  selected: boolean,
): RowEdits {
  const next = { ...edits };
  for (const row of rows) {
    if (!isSelectable(row)) continue;
    next[row.index] = { ...editOf(edits, row), selected };
  }
  return next;
}

export function setCategory(
  edits: RowEdits,
  row: ImportPreviewRow,
  categoryId: string | null,
): RowEdits {
  return { ...edits, [row.index]: { ...editOf(edits, row), categoryId, categoryFromAI: false } };
}

/**
 * Applique une catégorie aux lignes sélectionnées dont le type correspond à la nature de la
 * catégorie (une catégorie de dépense ne s'applique pas à un revenu). `null` = « Sans catégorie ».
 */
export function applyCategoryToSelection(
  edits: RowEdits,
  rows: readonly ImportPreviewRow[],
  category: Category | null,
): { edits: RowEdits; applied: number; skipped: number } {
  const next = { ...edits };
  let applied = 0;
  let skipped = 0;
  for (const row of rows) {
    if (!isSelected(edits, row)) continue;
    if (category !== null && category.kind !== row.type) {
      skipped++;
      continue;
    }
    next[row.index] = {
      ...editOf(edits, row),
      categoryId: category?.id ?? null,
      categoryFromAI: false,
    };
    applied++;
  }
  return { edits: next, applied, skipped };
}

export type CommitRow = ImportCommitInput['rows'][number];

/** Libellé nettoyé proposé par le serveur, s'il diffère du libellé brut. */
export function cleanedLabel(row: ImportPreviewRow): string | null {
  const s = row.suggestedLabel?.trim();
  return s && s !== row.label ? s : null;
}

/** Libellé affiché et importé : nettoyé si l'option est active et qu'une proposition existe. */
export function effectiveLabel(row: ImportPreviewRow, cleanLabels: boolean): string {
  return (cleanLabels ? cleanedLabel(row) : null) ?? row.label;
}

export function hasCleanableLabels(rows: readonly ImportPreviewRow[]): boolean {
  return rows.some((r) => cleanedLabel(r) !== null);
}

export function buildCommitRows(
  rows: readonly ImportPreviewRow[],
  edits: RowEdits,
  { cleanLabels = false }: { cleanLabels?: boolean } = {},
): CommitRow[] {
  const out: CommitRow[] = [];
  for (const row of rows) {
    if (!isSelected(edits, row)) continue;
    const edit = editOf(edits, row);
    const commit: CommitRow = {
      index: row.index,
      date: row.date,
      label: effectiveLabel(row, cleanLabels),
      amount: row.amount,
      type: row.type,
      importHash: row.importHash,
      categoryId: edit.categoryId,
      categoryFromAI: edit.categoryFromAI && edit.categoryId !== null,
    };
    if (row.note !== undefined) commit.note = row.note;
    out.push(commit);
  }
  return out;
}

/** Intervalle couvrant les dates des lignes, ou null s'il n'y en a aucune. */
export function dateSpan(rows: readonly { date: ISODate }[]): DateRange | null {
  let from: ISODate | null = null;
  let to: ISODate | null = null;
  for (const { date } of rows) {
    if (from === null || date < from) from = date;
    if (to === null || date > to) to = date;
  }
  return from !== null && to !== null ? { from, to } : null;
}

export function transactionsHref(span: DateRange | null): string {
  if (span === null) return '/transactions';
  const params = new URLSearchParams({ from: span.from, to: span.to });
  return `/transactions?${params.toString()}`;
}

/** « 1 transaction », « 3 transactions ». */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function pageCount(total: number, pageSize: number = PREVIEW_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

// ───────────────────────── Fichier ─────────────────────────

const CSV_TYPES = new Set(['text/csv', 'application/csv', 'application/vnd.ms-excel']);

/** Vérifie nom, type et taille du fichier ; renvoie un message d'erreur ou null. */
export function validateCsvFile(file: { name: string; size: number; type: string }): string | null {
  if (!/\.(csv|txt)$/i.test(file.name) && !CSV_TYPES.has(file.type)) {
    return 'Ce fichier n’est pas un CSV. Exportez votre relevé au format CSV depuis votre banque.';
  }
  if (file.size === 0) return 'Le fichier est vide.';
  if (file.size > MAX_FILE_BYTES)
    return 'Le fichier dépasse 5 Mo. Importez une période plus courte.';
  return null;
}

/**
 * Décode le fichier en UTF-8 ; si des caractères de remplacement apparaissent (fichier Excel
 * ou export bancaire en Windows-1252), repli sur Windows-1252.
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): {
  text: string;
  encoding: 'UTF-8' | 'Windows-1252';
} {
  const utf8 = new TextDecoder('utf-8').decode(buffer);
  if (!utf8.includes('�')) return { text: utf8, encoding: 'UTF-8' };
  return { text: new TextDecoder('windows-1252').decode(buffer), encoding: 'Windows-1252' };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** « 2026-03-12 » → « 12/03/2026 » (format des relevés tunisiens). */
function toDMY(iso: ISODate): string {
  const [y = '', m = '', d = ''] = iso.split('-');
  return `${pad2(Number(d))}/${m}/${y}`;
}

/**
 * CSV d'exemple au format des banques tunisiennes (« ; », débit/crédit, virgule décimale,
 * UTF-8 avec BOM), daté relativement à `dates` (du plus ancien au plus récent).
 */
export function buildSampleCsv(dates: readonly ISODate[]): string {
  const rows: [string, string, string, string][] = [
    ['VIR RECU SALAIRE', '', '2 600,000', 'Salaire du mois'],
    ['PRLV LOYER APPARTEMENT', '750,000', '', ''],
    ['PAIEMENT CB CARREFOUR LA MARSA', '87,450', '', ''],
    ['PAIEMENT CB CAFE DE PARIS', '4,500', '', ''],
    ['RETRAIT DAB BIAT LAC 2', '200,000', '', ''],
    ['PAIEMENT CB AGIL ENNASR', '60,000', '', 'Plein'],
    ['PRLV OOREDOO INTERNET', '49,000', '', ''],
    ['PAIEMENT CB MONOPRIX MENZAH', '53,280', '', ''],
  ];
  const lines = ['Date;Libellé;Débit;Crédit;Note'];
  rows.forEach((r, i) => {
    const date = dates[i] ?? dates[dates.length - 1];
    if (date === undefined) return;
    lines.push([toDMY(date), ...r].join(';'));
  });
  return `﻿${lines.join('\r\n')}\r\n`;
}
