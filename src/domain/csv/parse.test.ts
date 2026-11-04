import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectDelimiter, findIrregularRows, parseCsv } from './parse';

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf-8');

function parsed(text: string, opts?: { delimiter?: string }) {
  const r = parseCsv(text, opts);
  if (!r.ok) throw new Error(`parseCsv a échoué : ${r.error}`);
  return r.value;
}

describe('detectDelimiter', () => {
  it('détecte le point-virgule', () => {
    expect(detectDelimiter('a;b;c\n1;2;3\n')).toBe(';');
  });

  it('détecte la virgule', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n')).toBe(',');
  });

  it('détecte la tabulation', () => {
    expect(detectDelimiter('a\tb\tc\n1\t2\t3')).toBe('\t');
  });

  it('ignore les séparateurs entre guillemets', () => {
    // La virgule décimale apparaît partout, mais uniquement entre guillemets.
    expect(detectDelimiter('Date;Montant\n01/03/2026;"-12,500"\n02/03/2026;"3,000"\n')).toBe(';');
    expect(detectDelimiter('"a;b",c\n"1;2",3\n')).toBe(',');
  });

  it('préfère un séparateur régulier à un séparateur fréquent mais irrégulier', () => {
    const text = 'Date;Libellé;Montant\n01/03;Café, croissant, jus;-3,5\n02/03;Taxi;-7\n';
    expect(detectDelimiter(text)).toBe(';');
  });

  it('gère les retours à la ligne entre guillemets, le BOM et CR seul', () => {
    expect(detectDelimiter('﻿a,b\r"x\ny",2\r3,4')).toBe(',');
  });

  it('renvoie « ; » par défaut (une seule colonne ou texte vide)', () => {
    expect(detectDelimiter('libelle\nfoo\nbar')).toBe(';');
    expect(detectDelimiter('')).toBe(';');
  });

  it("n'examine que les premières lignes", () => {
    const head = Array.from({ length: 25 }, (_, i) => `${i};x`).join('\n');
    expect(detectDelimiter(`${head}\n${'a,b,c,d,e\n'.repeat(5)}`)).toBe(';');
  });

  it('détecte le séparateur des fixtures', () => {
    expect(detectDelimiter(fixture('biat.csv'))).toBe(';');
    expect(detectDelimiter(fixture('signed-comma.csv'))).toBe(';');
    expect(detectDelimiter(fixture('english-iso.csv'))).toBe(',');
    expect(detectDelimiter(fixture('quoted-multiline.csv'))).toBe(';');
  });
});

describe('parseCsv', () => {
  it('sépare en-têtes et lignes', () => {
    const r = parsed('Date;Libellé\n01/03/2026;Café\n');
    expect(r).toEqual({
      headers: ['Date', 'Libellé'],
      rows: [['01/03/2026', 'Café']],
      delimiter: ';',
    });
  });

  it('retire le BOM et accepte CRLF, LF et CR seul', () => {
    const r = parsed('﻿a;b\r\n1;2\n3;4\r5;6');
    expect(r.headers).toEqual(['a', 'b']);
    expect(r.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
      ['5', '6'],
    ]);
  });

  it('gère les guillemets, les "" échappés et les retours à la ligne dans un champ', () => {
    const r = parsed('a;b;c\n"x;y";"il dit ""bonjour""";"ligne 1\r\nligne 2"\n');
    expect(r.rows).toEqual([['x;y', 'il dit "bonjour"', 'ligne 1\r\nligne 2']]);
  });

  it('accepte les champs vides, entre guillemets ou non', () => {
    const r = parsed('a;b;c\nx;"";\n1;;3');
    expect(r.rows).toEqual([
      ['x', '', ''],
      ['1', '', '3'],
    ]);
  });

  it('ignore les lignes vides ou blanches', () => {
    const r = parsed('a;b\n\n1;2\n   \n;\n3;4\n\n');
    expect(r.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('tolère les guillemets au milieu d’un champ non protégé et le texte après un guillemet fermant', () => {
    const r = parsed('a;b\n12" écran;"abc"def\n');
    expect(r.rows).toEqual([['12" écran', 'abcdef']]);
  });

  it('ignore les espaces avant un guillemet ouvrant', () => {
    const r = parsed('a,b\n1,  "x,y"\n');
    expect(r.rows).toEqual([['1', 'x,y']]);
  });

  it('conserve les lignes de longueur différente', () => {
    const r = parsed('a;b;c\n1;2\n1;2;3;4\n');
    expect(r.rows).toEqual([
      ['1', '2'],
      ['1', '2', '3', '4'],
    ]);
    expect(findIrregularRows(r.headers, r.rows)).toEqual([0, 1]);
  });

  it('nettoie les espaces des en-têtes', () => {
    expect(parsed(' Date ; Montant \n1;2').headers).toEqual(['Date', 'Montant']);
  });

  it('respecte un séparateur imposé', () => {
    const r = parsed('a;b,c\n1;2,3', { delimiter: ',' });
    expect(r.delimiter).toBe(',');
    expect(r.headers).toEqual(['a;b', 'c']);
    expect(parsed('a;b\n1;2', { delimiter: '' }).delimiter).toBe(';');
  });

  it('refuse un séparateur invalide', () => {
    expect(parseCsv('a;b', { delimiter: '"' })).toEqual({
      ok: false,
      error: 'Séparateur invalide.',
    });
    expect(parseCsv('a;b', { delimiter: ';;' }).ok).toBe(false);
    expect(parseCsv('a;b', { delimiter: '\n' }).ok).toBe(false);
  });

  it('signale un guillemet non fermé avec le numéro de ligne', () => {
    const r = parseCsv('a;b\r\n1;2\r\n3;"oups\r\nsuite');
    expect(r).toEqual({ ok: false, error: 'Guillemet non fermé (ligne 3). Vérifiez le fichier.' });
    const lf = parseCsv('a;b\n"x\ny";2\n3;"z');
    expect(lf.ok ? '' : lf.error).toContain('ligne 4');
    const cr = parseCsv('a;b\r"x\ry";2\r3;"z');
    expect(cr.ok ? '' : cr.error).toContain('ligne 4');
  });

  it('refuse un fichier vide', () => {
    expect(parseCsv('')).toEqual({ ok: false, error: 'Le fichier est vide.' });
    expect(parseCsv('﻿\r\n\r\n  \n')).toEqual({ ok: false, error: 'Le fichier est vide.' });
  });

  it('lit un fichier sans fin de ligne finale', () => {
    expect(parsed('a;b\n1;2').rows).toEqual([['1', '2']]);
    expect(parsed('a;b\n1;').rows).toEqual([['1', '']]);
  });

  it('lit la fixture BIAT (BOM, CRLF, débit/crédit)', () => {
    const r = parsed(fixture('biat.csv'));
    expect(r.delimiter).toBe(';');
    expect(r.headers).toEqual([
      'Date opération',
      'Date valeur',
      'Libellé',
      'Débit',
      'Crédit',
      'Solde',
    ]);
    expect(r.rows).toHaveLength(6);
    expect(r.rows[0]).toEqual([
      '02/03/2026',
      '03/03/2026',
      'PAIEMENT CB CARREFOUR LA MARSA 02/03',
      '87,450',
      '',
      '2 345,120',
    ]);
    expect(findIrregularRows(r.headers, r.rows)).toEqual([]);
  });

  it('lit la fixture avec guillemets et retours à la ligne', () => {
    const r = parsed(fixture('quoted-multiline.csv'));
    expect(r.rows).toEqual([
      ['01/04/2026', 'Restaurant "Le Golfe"', '-78,000', 'dîner "anniversaire"'],
      ['02/04/2026', 'Courses Monoprix\r\nEnnasr', '-45,300', 'ligne 1\r\nligne 2'],
      ['03/04/2026', 'Virement; Sami', '150,000', ''],
      ['04/04/2026', 'Ooredoo internet', '-49,000', '', 'colonne en trop'],
      ['05/04/2026', 'Taxi'],
    ]);
    expect(findIrregularRows(r.headers, r.rows)).toEqual([3, 4]);
  });

  it('lit la fixture anglaise (virgule, montants entre guillemets)', () => {
    const r = parsed(fixture('english-iso.csv'));
    expect(r.delimiter).toBe(',');
    expect(r.rows[1]).toEqual(['2026-03-02', 'Rent, March', '-1,234.50', 'flat']);
  });
});
