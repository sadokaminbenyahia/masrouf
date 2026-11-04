/**
 * Lecture de fichiers CSV (RFC 4180), côté client.
 *  - champs entre guillemets, guillemets doublés (« "" ») échappés, retours à la ligne dans un champ ;
 *  - fins de ligne CRLF, LF ou CR ; BOM UTF-8 ignoré ;
 *  - lignes vides ignorées ; lignes de longueur différente conservées telles quelles
 *    (voir `findIrregularRows` pour les signaler).
 */
import { err, ok, type Result } from '../result';

export type CsvDelimiter = ';' | ',' | '\t';

const CANDIDATES: readonly CsvDelimiter[] = [';', ',', '\t'];
/** Nombre de lignes logiques examinées pour deviner le séparateur. */
const SNIFF_LINES = 20;
/** Taille maximale examinée pour deviner le séparateur. */
const SNIFF_CHARS = 64_000;

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Compte, pour chaque séparateur candidat, ses occurrences hors guillemets sur chacune
 * des premières lignes logiques (un retour à la ligne entre guillemets ne termine pas la ligne).
 */
function countPerLine(text: string): Map<CsvDelimiter, number[]> {
  const counts = new Map<CsvDelimiter, number[]>(CANDIDATES.map((c) => [c, []]));
  const current = new Map<CsvDelimiter, number>(CANDIDATES.map((c) => [c, 0]));
  let inQuotes = false;
  let lineHasContent = false;
  let lines = 0;
  const limit = Math.min(text.length, SNIFF_CHARS);

  const flush = () => {
    if (lineHasContent) {
      for (const c of CANDIDATES) counts.get(c)?.push(current.get(c) ?? 0);
      lines++;
    }
    for (const c of CANDIDATES) current.set(c, 0);
    lineHasContent = false;
  };

  for (let i = 0; i < limit && lines < SNIFF_LINES; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      lineHasContent = true;
    } else if (!inQuotes && (ch === '\n' || ch === '\r')) {
      flush();
    } else if (!inQuotes && (ch === ';' || ch === ',' || ch === '\t')) {
      current.set(ch, (current.get(ch) ?? 0) + 1);
      lineHasContent = true;
    } else if (ch !== ' ') {
      lineHasContent = true;
    }
  }
  if (lines < SNIFF_LINES) flush();
  return counts;
}

/**
 * Devine le séparateur (« ; », « , » ou tabulation) en comptant ses occurrences hors guillemets
 * sur les premières lignes. Un séparateur présent avec le même nombre d'occurrences sur toutes
 * les lignes l'emporte ; à défaut, le plus fréquent. « ; » par défaut (usage tunisien et français).
 */
export function detectDelimiter(text: string): ';' | ',' | '\t' {
  const counts = countPerLine(stripBom(text));
  let best: CsvDelimiter = ';';
  let bestScore = 0;
  for (const c of CANDIDATES) {
    const perLine = counts.get(c) ?? [];
    const first = perLine[0] ?? 0;
    if (first === 0) continue;
    const consistent = perLine.every((n) => n === first);
    const present = perLine.filter((n) => n > 0).length / perLine.length;
    const avg = perLine.reduce((a, b) => a + b, 0) / perLine.length;
    const score = (consistent ? 1000 : 0) + present * 100 + avg;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function isBlankRecord(record: readonly string[]): boolean {
  return record.every((cell) => cell.trim() === '');
}

/**
 * Découpe un texte CSV en lignes et cellules. La première ligne non vide devient `headers`.
 * Erreur (message en français) si le fichier est vide ou si un guillemet n'est jamais fermé.
 */
export function parseCsv(
  text: string,
  opts?: { delimiter?: string },
): Result<{ headers: string[]; rows: string[][]; delimiter: string }, string> {
  const source = stripBom(text);
  const delimiter =
    opts?.delimiter && opts.delimiter.length > 0 ? opts.delimiter : detectDelimiter(source);
  if (delimiter.length !== 1 || delimiter === '"' || delimiter === '\n' || delimiter === '\r') {
    return err('Séparateur invalide.');
  }

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let quoteStartLine = 1;
  let line = 1;
  let i = 0;
  const n = source.length;

  const endField = () => {
    record.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (!isBlankRecord(record)) records.push(record);
    record = [];
  };

  while (i < n) {
    const ch = source[i];
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      if (ch === '\n') line++;
      if (ch === '\r' && source[i + 1] !== '\n') line++;
      field += ch;
      i++;
      continue;
    }

    if (ch === '"' && field.trim() === '') {
      // Guillemet ouvrant (les espaces avant le guillemet sont ignorés).
      field = '';
      inQuotes = true;
      quoteStartLine = line;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      endRecord();
      i += ch === '\r' && source[i + 1] === '\n' ? 2 : 1;
      line++;
      continue;
    }
    // Caractère ordinaire, y compris un guillemet au milieu d'un champ non protégé (toléré).
    field += ch;
    i++;
  }

  if (inQuotes) {
    return err(`Guillemet non fermé (ligne ${quoteStartLine}). Vérifiez le fichier.`);
  }
  if (field !== '' || record.length > 0) endRecord();

  const [headers, ...rows] = records;
  if (!headers) return err('Le fichier est vide.');
  return ok({ headers: headers.map((h) => h.trim()), rows, delimiter });
}

/**
 * Lignes dont le nombre de cellules diffère de celui des en-têtes (index dans `rows`).
 * Elles restent importables si les colonnes utilisées sont présentes.
 */
export function findIrregularRows(headers: readonly string[], rows: readonly string[][]): number[] {
  const out: number[] = [];
  rows.forEach((row, index) => {
    if (row.length !== headers.length) out.push(index);
  });
  return out;
}
