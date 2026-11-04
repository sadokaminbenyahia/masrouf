// Cas limites ciblés sur les modules du domaine dont la couverture de branches était < 90 % :
// dates (bissextiles, fuseaux), anomalies, saisie NL, récurrences, résumé mensuel (tous les
// gabarits), assistant (périodes, entités, réponses), statistiques.
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  addMonthsYM,
  daysInMonth,
  diffMonthsYM,
  formatDateFR,
  isISODate,
  lastMonths,
  monthEnd,
  quarterStart,
  startOfWeek,
  todayInTimeZone,
} from '@/domain/dates';
import { resolvePeriod, PERIOD_PRESETS } from '@/domain/periods';
import { monthsUntil } from '@/domain/goals';
import { detectAnomalies } from '@/domain/ai/anomalies';
import { extractAmount, extractDate, foldKeepLength, parseEntry } from '@/domain/ai/nl-entry';
import { detectRecurring, detectSeries } from '@/domain/ai/recurring-detect';
import { generateMonthlySummary } from '@/domain/ai/summary';
import { askAssistant } from '@/domain/ai/assistant';
import { parsePeriods } from '@/domain/ai/assistant/periods';
import { extractQuestionAmount, matchGoal } from '@/domain/ai/assistant/entities';
import {
  capitalize,
  contentWords,
  formatPercent,
  jaccard,
  normalizeQuestion,
} from '@/domain/ai/assistant/normalize';
import {
  ceilTo,
  clamp,
  coefficientOfVariation,
  ewma,
  floorTo,
  linearRegression,
  mad,
  median,
  quantile,
  stdDev,
} from '@/domain/ai/stats';
import { categoryId } from '@/domain/ai/__fixtures__/categories';
import { assistantAnswerSchema } from '@/server/ai/output-schemas';
import type { AiTransaction, AssistantContext, MonthlySummaryInput } from '@/domain/ai/types';
import {
  CATEGORIES,
  RULES,
  TODAY,
  budgetProgress,
  fakeTools,
  goalProgress,
  syntheticHistory,
} from './helpers/finance-fixtures';

let seq = 0;
function tx(
  date: string,
  amount: number,
  label: string,
  categoryName: string | null,
  extra: Partial<AiTransaction> = {},
): AiTransaction {
  seq++;
  return {
    id: `e${String(seq).padStart(5, '0')}`,
    date,
    amount,
    type: 'EXPENSE',
    label,
    categoryId: categoryName === null ? null : categoryId(categoryName),
    accountId: 'acc_bank',
    recurringId: null,
    ...extra,
  };
}

// ───────────────────────── Dates ─────────────────────────

describe('dates : fins de mois, bissextiles, fuseaux', () => {
  it('daysInMonth : règles grégoriennes (2000 oui, 1900 et 2100 non)', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(isISODate('2100-02-29')).toBe(false);
  });

  it('addMonths borne au dernier jour (31 janv. → 29 févr. bissextile)', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2025-01-31', 1)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', 12)).toBe('2025-02-28');
    expect(addMonths('2024-02-29', 48)).toBe('2028-02-29');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
    expect(addMonthsYM('2026-01', -1)).toBe('2025-12');
    expect(diffMonthsYM('2025-11', '2026-02')).toBe(3);
  });

  it('monthsUntil : jour cible antérieur au jour courant, fin de mois', () => {
    expect(monthsUntil('2026-01-31', '2026-02-28')).toBe(0);
    expect(monthsUntil('2026-01-31', '2026-03-31')).toBe(2);
    expect(monthsUntil('2026-11-04', '2026-10-01')).toBe(0);
  });

  it('todayInTimeZone : la date dépend du fuseau, pas de l’horloge locale', () => {
    const lateUtc = new Date(Date.UTC(2026, 11, 31, 23, 30));
    expect(todayInTimeZone('Africa/Tunis', lateUtc)).toBe('2027-01-01');
    expect(todayInTimeZone('UTC', lateUtc)).toBe('2026-12-31');
    expect(todayInTimeZone('America/Los_Angeles', lateUtc)).toBe('2026-12-31');
    const leap = new Date(Date.UTC(2028, 1, 28, 23, 15));
    expect(todayInTimeZone('Africa/Tunis', leap)).toBe('2028-02-29');
    expect(todayInTimeZone('Pacific/Kiritimati', new Date(Date.UTC(2026, 0, 1, 10, 0)))).toBe(
      '2026-01-02',
    );
  });

  it('semaines, trimestres, formats', () => {
    expect(startOfWeek('2026-01-01')).toBe('2025-12-29');
    expect(quarterStart('2026-12-31')).toBe('2026-10-01');
    expect(formatDateFR('2026-03-01')).toBe('1er mars 2026');
    expect(lastMonths('2026-02-15', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(monthEnd('2028-02')).toBe('2028-02-29');
  });

  it('resolvePeriod : chaque preset donne un intervalle valide, y compris un 29 février', () => {
    for (const today of ['2024-02-29', '2026-01-01', '2026-12-31']) {
      for (const preset of PERIOD_PRESETS) {
        const r = resolvePeriod(preset, today);
        expect(isISODate(r.from) && isISODate(r.to), `${preset} ${today}`).toBe(true);
        expect(r.from <= r.to).toBe(true);
      }
    }
    expect(resolvePeriod('LAST_MONTH', '2026-01-15')).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
    expect(resolvePeriod('THIS_QUARTER', '2024-02-29')).toEqual({
      from: '2024-01-01',
      to: '2024-03-31',
    });
    expect(resolvePeriod('CUSTOM', TODAY, { from: '2026-01-01', to: '2026-01-02' })).toEqual({
      from: '2026-01-01',
      to: '2026-01-02',
    });
  });
});

// ───────────────────────── Statistiques ─────────────────────────

describe('stats : listes vides et cas dégénérés', () => {
  it('jamais NaN sur un tableau vide', () => {
    for (const f of [median, mad, stdDev, coefficientOfVariation]) expect(f([])).toBe(0);
    expect(quantile([], 0.9)).toBe(0);
    expect(ewma([], 30)).toBe(0);
    expect(linearRegression([], [])).toEqual({ slope: 0, intercept: 0, residualStd: 0 });
  });

  it('quantile borné, ewma sans demi-vie, régression à x constants ou longueurs différentes', () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 2)).toBe(3);
    expect(ewma([5, 7, 9], 0)).toBe(9);
    expect(linearRegression([2, 2, 2], [1, 2, 3])).toEqual({
      slope: 0,
      intercept: 2,
      residualStd: Math.sqrt(2),
    });
    const fit = linearRegression([0, 1, 2, 3, 99], [1, 3, 5, 7]);
    expect(fit.slope).toBeCloseTo(2, 12);
    expect(fit.intercept).toBeCloseTo(1, 12);
    expect(coefficientOfVariation([-1, 1])).toBe(0);
    expect(ceilTo(1001, 1000)).toBe(2000);
    expect(floorTo(1999, 1000)).toBe(1000);
    expect(clamp(5, 0, 1)).toBe(1);
  });
});

// ───────────────────────── Anomalies ─────────────────────────

describe('anomalies : branches rares', () => {
  const base = { today: TODAY, categories: CATEGORIES, recurring: RULES, dismissedKeys: [] };

  it('dépense non catégorisée (repli IQR) : message sans nom de catégorie', () => {
    const txs = [20_000, 22_000, 25_000, 21_000, 23_000].map((a, i) =>
      tx(`2026-10-0${i + 1}`, a, `Achat ${i}`, null),
    );
    const big = tx('2026-10-30', 200_000, 'Achat mystère', null);
    const out = detectAnomalies({ ...base, transactions: [...txs, big] });
    const a = out.find((x) => x.key === `anomaly:unusual:${big.id}`);
    expect(a?.title).toBe('Dépense inhabituelle');
    expect(a?.expectedAmount).toBe(22_000);
    expect(a?.message).toContain('alors qu’une dépense tourne habituellement');
    expect(a?.severity).toBe('DANGER');
  });

  it('catégorie absente de la liste : « cette catégorie »', () => {
    const txs = [20_000, 22_000, 25_000, 21_000, 23_000].map((a, i) =>
      tx(`2026-10-0${i + 1}`, a, `Achat ${i}`, null, { categoryId: 'cat_supprimee' }),
    );
    const big = tx('2026-10-30', 90_000, 'Gros achat', null, { categoryId: 'cat_supprimee' });
    const out = detectAnomalies({ ...base, transactions: [...txs, big] });
    const a = out.find((x) => x.key === `anomaly:unusual:${big.id}`);
    expect(a?.title).toBe('Dépense inhabituelle en cette catégorie');
    expect(a?.severity).toBe('WARNING');
  });

  it('doublon à 1 jour : « 1 jour » au singulier ; libellé sans clé marchand ignoré', () => {
    const a1 = tx('2026-10-20', 60_000, 'STATION AGIL', 'Carburant');
    const a2 = tx('2026-10-21', 60_000, 'STATION AGIL', 'Carburant');
    const n1 = tx('2026-10-22', 5_000, '12/10', null);
    const n2 = tx('2026-10-22', 5_000, '12/10', null);
    const out = detectAnomalies({ ...base, transactions: [a1, a2, n1, n2] });
    const dup = out.filter((x) => x.kind === 'DUPLICATE');
    expect(dup).toHaveLength(1);
    expect(dup[0]?.message).toContain('à 1 jour d’intervalle');
  });

  it('montants nuls, virements et transactions futures exclus', () => {
    const out = detectAnomalies({
      ...base,
      transactions: [
        tx('2026-10-20', 0, 'Zéro', 'Courses'),
        tx('2026-10-20', 0, 'Zéro', 'Courses'),
        tx('2026-10-20', 500_000, 'Virement', null, { type: 'TRANSFER' }),
        tx('2026-10-20', 500_000, 'Virement', null, { type: 'TRANSFER' }),
        tx('2026-12-20', 900_000, 'Futur', 'Courses'),
      ],
    });
    expect(out).toEqual([]);
  });

  it('historique vide : aucune anomalie', () => {
    expect(detectAnomalies({ ...base, transactions: [] })).toEqual([]);
  });
});

// ───────────────────────── Saisie en langage naturel ─────────────────────────

describe('parseEntry / extractDate : cas limites', () => {
  const ctx = {
    today: TODAY,
    categories: CATEGORIES,
    accounts: [
      { id: 'acc_cb', name: 'CB', type: 'CARD' },
      { id: 'acc_cash', name: 'Caisse', type: 'CASH' },
    ],
    model: null,
  };

  it('foldKeepLength conserve la longueur (marque combinante isolée, hangeul)', () => {
    expect(foldKeepLength('é')).toBe('e ');
    expect(foldKeepLength('한')).toHaveLength(1);
    expect(foldKeepLength('Café’s')).toBe("cafe's");
  });

  it('« le 25 » en janvier remonte en décembre de l’année précédente', () => {
    expect(extractDate('taxi 8 le 25', '2026-01-10')?.date).toBe('2025-12-25');
    expect(extractDate('le 31', '2026-03-15')?.date).toBe('2026-01-31');
    expect(extractDate('le 29', '2024-03-10')?.date).toBe('2024-02-29');
  });

  it('dates numériques invalides ignorées (mois 13, 31 février)', () => {
    expect(extractDate('pain 2 12/13', TODAY)).toBeNull();
    expect(extractDate('facture 30 31/02/2026', TODAY)).toBeNull();
    expect(extractDate('le 29/02/2028', TODAY)?.date).toBe('2028-02-29');
    expect(extractDate('le 12.03.26', TODAY)?.date).toBe('2026-03-12');
  });

  it('montants : très grand refusé, zéro refusé, collé à des lettres ignoré', () => {
    expect(extractAmount('99999999999999999 dt')).toBeNull();
    expect(extractAmount('0 dt')).toBeNull();
    expect(extractAmount('9ahwa')).toBeNull();
    expect(extractAmount('1 200,5 dt')?.amount).toBe(1_200_500);
  });

  it('nom de compte trop court ignoré : repli sur le type (« cb » → carte)', () => {
    const r = parseEntry('café 2 avec ma cb', ctx);
    expect(r.ok && r.entry.accountId).toBe('acc_cb');
    const s = parseEntry('café 2 caisse', ctx);
    expect(s.ok && s.entry.accountId).toBe('acc_cash');
  });

  it('libellé de revenu reconnu par les seules règles : bascule en revenu', () => {
    const r = parseEntry('chahriya 2400', ctx);
    if (!r.ok) throw new Error(r.message);
    expect(r.entry.type).toBe('INCOME');
    expect(r.entry.categoryId).toBe(categoryId('Salaire'));
  });

  it('sans libellé : libellé générique ; texte tronqué à 500 caractères', () => {
    const r = parseEntry('12 dt', ctx);
    expect(r.ok && r.entry.label).toBe('Dépense');
    const s = parseEntry('+12 dt', ctx);
    expect(s.ok && s.entry.label).toBe('Revenu');
    const long = parseEntry(`${'a'.repeat(600)} 5 dt`, ctx);
    expect(long.ok).toBe(false);
  });
});

// ───────────────────────── Récurrences détectées ─────────────────────────

describe('detectSeries / detectRecurring : cas limites', () => {
  it('virements, montants nuls et libellés sans clé marchand ignorés', () => {
    const txs: AiTransaction[] = [];
    for (const d of ['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10']) {
      txs.push(tx(d, 45_000, 'VIREMENT EPARGNE', null, { type: 'TRANSFER' }));
      txs.push(tx(d, 0, 'GRATUIT', null));
      txs.push(tx(d, 10_000, '12/03', null));
    }
    expect(detectSeries(txs)).toEqual([]);
  });

  it('facture trop irrégulière (CV ≥ 0,4) rejetée ; régulière acceptée sans catégorie', () => {
    const wild = [20_000, 180_000, 35_000, 240_000, 15_000].map((a, i) =>
      tx(`2026-0${i + 5}-12`, a, 'STEG FACTURE', null),
    );
    expect(detectSeries(wild)).toEqual([]);
    const regular = [60_000, 62_000, 58_000, 61_000].map((a, i) =>
      tx(`2026-${String(i + 7).padStart(2, '0')}-12`, a, 'SONEDE FACTURE EAU', null),
    );
    const found = detectRecurring({ today: TODAY, transactions: regular, existing: [] });
    expect(found).toHaveLength(1);
    expect(found[0]?.categoryId).toBeNull();
    expect(found[0]?.amount).toBe(60_500);
    expect(found[0]?.nextDate >= TODAY).toBe(true);
  });

  it('série couverte par une règle de même libellé normalisé : non suggérée', () => {
    const series = ['2026-07-02', '2026-08-02', '2026-09-02', '2026-10-02'].map((d) =>
      tx(d, 30_000, 'Salle de sport', 'Loisirs'),
    );
    const rule = { ...RULES[1], id: 'rec_gym', label: 'Salle de sport', amount: 30_000 };
    if (!rule.accountId) throw new Error('règle invalide');
    expect(detectRecurring({ today: TODAY, transactions: series, existing: [] })).toHaveLength(1);
    expect(
      detectRecurring({
        today: TODAY,
        transactions: series,
        existing: [{ ...rule, type: 'EXPENSE', frequency: 'MONTHLY' }],
      }),
    ).toEqual([]);
  });
});

// ───────────────────────── Résumé mensuel : tous les gabarits ─────────────────────────

describe('generateMonthlySummary : gabarits et branches', () => {
  /** Mois `month` et 3 précédents ; dépense mensuelle du mois courant paramétrable. */
  function scenario(opts: {
    month: string;
    prevExpense: number;
    curExpense: number;
    income: number;
  }): AiTransaction[] {
    const out: AiTransaction[] = [];
    for (let k = 3; k >= 0; k--) {
      const ym = addMonthsYM(opts.month, -k);
      const expense = k === 0 ? opts.curExpense : opts.prevExpense;
      if (opts.income > 0 || k > 0) {
        out.push(
          tx(`${ym}-01`, k === 0 ? opts.income : 2_000_000, 'SALAIRE', 'Salaire', {
            type: 'INCOME',
          }),
        );
      }
      out.push(tx(`${ym}-02`, Math.round(expense * 0.6), 'CARREFOUR', 'Courses'));
      out.push(tx(`${ym}-03`, Math.round(expense * 0.4), 'LOYER', 'Loyer', { recurringId: 'rec_loyer' }));
    }
    if (opts.income === 0) {
      return out.filter((t) => !(t.type === 'INCOME' && t.date.startsWith(opts.month)));
    }
    return out;
  }

  const SEEDS = Array.from({ length: 40 }, (_, i) => `seed-${i}`);
  const baseInput = (transactions: AiTransaction[], month: string): MonthlySummaryInput => ({
    month,
    today: TODAY,
    transactions,
    categories: CATEGORIES,
    budgets: [],
    goals: [],
    seed: 's',
  });

  function texts(input: MonthlySummaryInput): Set<string> {
    const set = new Set<string>();
    for (const seed of SEEDS) {
      const s = generateMonthlySummary({ ...input, seed });
      const all = [s.title, ...s.paragraphs, ...s.recommendations.map((r) => r.detail)].join(' ');
      expect(all).not.toMatch(/undefined|NaN|Infinity/);
      set.add(s.paragraphs[0] ?? '');
    }
    return set;
  }

  it('baisse marquée, bonne épargne, budgets respectés, objectif atteint', () => {
    const input = {
      ...baseInput(scenario({ month: '2026-08', prevExpense: 1_000_000, curExpense: 500_000, income: 2_000_000 }), '2026-08'),
      budgets: [budgetProgress('Courses', 600_000, 300_000, '2026-08')],
      goals: [goalProgress({ id: 'g', name: 'Voyage', status: 'COMPLETED', ratio: 1 })],
    };
    expect(texts(input).size).toBeGreaterThanOrEqual(3);
    const twoBudgets = {
      ...input,
      budgets: [...input.budgets, budgetProgress('Restaurants', 100_000, 10_000, '2026-08')],
    };
    const joined = SEEDS.map((seed) => generateMonthlySummary({ ...twoBudgets, seed }).paragraphs.join(' ')).join(' ');
    // Le fait « budgets respectés » est peu prioritaire : l'objectif atteint passe devant.
    expect(joined).toMatch(/« Voyage »/);
    expect(joined).toMatch(/de moins|reculent|en moins/);
    // « d'août » : le mois commence par une voyelle.
    expect(SEEDS.some((seed) => /d'août 2026/.test(JSON.stringify(generateMonthlySummary({ ...input, seed }))))).toBe(true);
  });

  it('dépenses stables et épargne moyenne', () => {
    const txs = scenario({ month: '2026-09', prevExpense: 1_000_000, curExpense: 1_010_000, income: 1_100_000 });
    const all = SEEDS.map((seed) => generateMonthlySummary({ ...baseInput(txs, '2026-09'), seed }).paragraphs.join(' '));
    expect(all.join(' ')).toMatch(/stables|très proche|Peu de changement/);
    expect(all.join(' ')).toMatch(/épargn|mis de côté/);
  });

  it('aucun revenu enregistré ce mois', () => {
    const txs = scenario({ month: '2026-10', prevExpense: 900_000, curExpense: 950_000, income: 0 });
    const set = texts(baseInput(txs, '2026-10'));
    expect([...set].every((t) => /revenu/.test(t))).toBe(true);
    expect(set.size).toBeGreaterThanOrEqual(3);
  });

  it('mois en cours : titre « point d’étape », comparaison à date', () => {
    const txs = scenario({ month: '2026-11', prevExpense: 900_000, curExpense: 300_000, income: 2_000_000 });
    const titles = new Set(SEEDS.map((seed) => generateMonthlySummary({ ...baseInput(txs, '2026-11'), seed }).title));
    expect(titles.size).toBe(3);
    expect([...titles].some((t) => /novembre/i.test(t))).toBe(true);
  });

  it('budget unique dépassé, objectif en retard sans date, budget incohérent ignoré', () => {
    const txs = scenario({ month: '2026-10', prevExpense: 1_000_000, curExpense: 1_200_000, income: 1_150_000 });
    const over = budgetProgress('Courses', 500_000, 720_000, '2026-10');
    const inconsistent = { ...budgetProgress('Loyer', 500_000, 400_000, '2026-10'), level: 'EXCEEDED' as const };
    const input: MonthlySummaryInput = {
      ...baseInput(txs, '2026-10'),
      budgets: [over, inconsistent],
      goals: [goalProgress({ id: 'g', name: 'Maison', status: 'OVERDUE', monthlyNeeded: null, targetDate: null })],
    };
    const s = generateMonthlySummary(input);
    expect(s.recommendations.length).toBe(3);
    const titles = s.recommendations.map((r) => r.title).join(' | ');
    expect(titles).toContain('Ramener Courses sous son budget');
    expect(titles).not.toContain('Ramener Loyer');
    const late = SEEDS.flatMap((seed) => generateMonthlySummary({ ...input, budgets: [], seed }).recommendations).find(
      (r) => r.title.includes('Maison'),
    );
    expect(late?.detail).toContain('a pris du retard');
    expect(late?.impact).toBeNull();
  });

  it('historique synthétique réel : 3 recommandations (septembre, octobre)', () => {
    const h = syntheticHistory();
    for (const month of ['2026-09', '2026-10']) {
      const s = generateMonthlySummary({ ...baseInput(h, month), seed: 'u' });
      expect(s.recommendations).toHaveLength(3);
    }
  });

  // BUG: src/domain/ai/summary.ts:627 et :642 — les replis TRIM_VARIABLE (`variable[0]`) et
  // SET_BUDGET (`curCats.find(...)`) ne considèrent que la PREMIÈRE catégorie éligible. Si elle
  // est déjà retenue par une recommandation principale (ici « Freiner la hausse en Courses »),
  // le dédoublonnage par catégorie (:662) les écarte tous les deux et le résumé n'a que 2
  // recommandations, alors que Restaurants, Transport… (≥ 2 dépenses, sans budget) étaient
  // disponibles. Attendu : 3 recommandations (contrat MonthlySummary : « exactement 3, moins
  // seulement si les données manquent ») ; obtenu : 2 pour août 2026 de l'historique synthétique.
  it.fails('historique synthétique réel : 3 recommandations aussi en août', () => {
    const s = generateMonthlySummary({ ...baseInput(syntheticHistory(), '2026-08'), seed: 'u' });
    expect(s.recommendations.map((r) => r.title)).toEqual([
      'Freiner la hausse en Courses',
      'Vos petites dépenses en Cafés',
      expect.any(String),
    ]);
  });
});

// ───────────────────────── Assistant : périodes, entités, réponses ─────────────────────────

describe('assistant : périodes (cas limites)', () => {
  const p = (q: string, today = TODAY) =>
    parsePeriods(normalizeQuestion(q), today).map(({ from, to, label }) => ({ from, to, label }));

  it.each(['les 0 derniers mois', 'les 200 derniers mois'])('« %s » → aucune période', (q) => {
    expect(p(q)).toEqual([]);
  });

  it('intervalle invalide (mois 13) : seule la date valide « 20/12 » est retenue', () => {
    expect(p('du 15/13 au 20/12')).toEqual([
      { from: '2025-12-20', to: '2025-12-20', label: 'le 20 décembre 2025' },
    ]);
  });

  it('« depuis » une date future : pas d’intervalle « depuis … jusqu’à aujourd’hui »', () => {
    // Le motif « depuis » est rejeté ; le jour / mois futur est relu par les motifs suivants.
    for (const q of ['depuis le 10 novembre 2027', 'depuis decembre 2027']) {
      const [first] = p(q);
      expect(first?.to).not.toBe(TODAY);
      expect((first?.from ?? '') > TODAY).toBe(true);
    }
  });

  it('« sur 1 mois » → le dernier mois glissant', () => {
    expect(p('sur 1 mois')).toEqual([{ from: '2026-10-05', to: TODAY, label: 'le dernier mois' }]);
  });

  it('« depuis le 10 décembre » → décembre de l’année précédente', () => {
    expect(p('depuis le 10 decembre')[0]).toMatchObject({ from: '2025-12-10', to: TODAY });
  });

  it('« depuis mars 2025 » → libellé avec l’année', () => {
    expect(p('depuis mars 2025')[0]).toMatchObject({ from: '2025-03-01', label: 'depuis mars 2025' });
  });

  it('« entre le 20 décembre et le 5 janvier » à cheval sur deux années', () => {
    expect(p('entre le 20 decembre et le 5 janvier', '2026-01-10')[0]).toMatchObject({
      from: '2025-12-20',
      to: '2026-01-05',
    });
  });

  it('« du 20 au 5 » : bornes remises dans l’ordre ; « le 31 février » borné au 28', () => {
    expect(p('du 20 au 5')[0]).toMatchObject({ from: '2026-11-05', to: '2026-11-20' });
    expect(p('le 31 fevrier 2026')[0]).toMatchObject({ from: '2026-02-28', to: '2026-02-28' });
    expect(p('du 1/02/26 au 3/02/26')[0]).toMatchObject({ from: '2026-02-01', to: '2026-02-03' });
  });

  it('jour ou mois invalides ignorés (« le 45/12 », « le 12/13 »)', () => {
    expect(p('le 45/12')).toEqual([]);
    expect(p('le 12/13')).toEqual([]);
  });
});

describe('assistant : entités et normalisation', () => {
  it('extractQuestionAmount : unités, « k », nombres non monétaires', () => {
    expect(extractQuestionAmount('telephone a 900 dinars')).toBe(900_000);
    expect(extractQuestionAmount('voiture a 2,5k')).toBe(2_500_000);
    expect(extractQuestionAmount('dans 3 mois pour 1200')).toBe(1_200_000);
    expect(extractQuestionAmount('rien ici')).toBeNull();
    expect(extractQuestionAmount('0 dt')).toBeNull();
    expect(extractQuestionAmount('99999999999999 dt')).toBeNull();
  });

  // BUG: src/domain/ai/assistant/entities.ts:261-262 — avec l'unité « k », le résultat de
  // parseMoneyTerm est multiplié par 1000 sans revérifier Number.isSafeInteger.
  // Entrée « 9999999999k » → attendu : null (ou un entier sûr) ; obtenu : 9 999 999 999 000 000
  // (> Number.MAX_SAFE_INTEGER), qui est ensuite formaté/comparé comme un montant.
  it.fails('extractQuestionAmount : jamais d’entier non sûr (« 9999999999k »)', () => {
    const v = extractQuestionAmount('je peux acheter un yacht a 9999999999k');
    expect(v === null || Number.isSafeInteger(v)).toBe(true);
  });

  it('matchGoal : nom exact, flou, absent', () => {
    const goals = [
      { id: 'g1', name: 'Voyage à Djerba' },
      { id: 'g2', name: 'Voiture' },
    ];
    expect(matchGoal(normalizeQuestion('quand j’atteins mon objectif voyage ?'), goals)?.goal.id).toBe('g1');
    expect(matchGoal(normalizeQuestion('ma voitur'), goals)?.goal.id).toBe('g2');
    expect(matchGoal(normalizeQuestion('mon objectif'), goals)).toBeNull();
    expect(matchGoal('x', [])).toBeNull();
  });

  it('normalisation : vides et petites valeurs', () => {
    expect(contentWords('')).toEqual([]);
    expect(jaccard(new Set(), new Set())).toBe(0);
    expect(capitalize('')).toBe('');
    expect(formatPercent(0.005)).toBe('0,5 %');
    expect(formatPercent(-0.25, true)).toBe('−25 %');
    expect(formatPercent(0.25, true)).toBe('+25 %');
    expect(formatPercent(0)).toBe('0 %');
  });
});

describe('assistant : batterie de questions (réponses valides, chiffres issus des outils)', () => {
  const history = syntheticHistory();
  const ctx: AssistantContext = {
    today: TODAY,
    categories: CATEGORIES,
    accounts: [{ id: 'acc_bank', name: 'BIAT' }],
    goals: [
      { id: 'g1', name: 'Voyage à Djerba' },
      { id: 'g2', name: 'Fonds d’urgence' },
    ],
  };
  const budgets = [
    budgetProgress('Courses', 600_000, 250_000, '2026-11'),
    budgetProgress('Restaurants', 100_000, 140_000, '2026-11'),
    budgetProgress('Cafés', 50_000, 45_000, '2026-11'),
  ];
  const goals = [
    goalProgress({ id: 'g1', name: 'Voyage à Djerba', targetDate: '2027-06-30', monthlyNeeded: 300_000, status: 'AT_RISK', monthsLeft: 7 }),
    goalProgress({ id: 'g2', name: 'Fonds d’urgence', status: 'COMPLETED', ratio: 1, savedAmount: 3_000_000 }),
  ];
  const QUESTIONS = [
    'combien j’ai dépensé ce mois ?',
    'combien j’ai dépensé en courses depuis janvier ?',
    'combien j’ai gagné cette année ?',
    'combien j’ai reçu en freelance les 6 derniers mois ?',
    'est-ce que je dépense plus que le mois dernier ?',
    'je dépense plus qu’en juillet ?',
    'compare septembre et octobre',
    'où part mon argent ce trimestre ?',
    'mes plus gros commerçants cette année',
    'ma plus grosse dépense en restaurants',
    'combien je dépense en moyenne en cafés ?',
    'il me reste combien en budget restaurants ?',
    'il me reste combien dans mes budgets ?',
    'budget loisirs',
    'quel est mon solde ?',
    'combien j’aurai à la fin du mois ?',
    'je peux acheter un téléphone à 900 dinars ?',
    'je peux me permettre 99999 dinars ?',
    'mes abonnements',
    'quand j’atteins mon objectif voyage ?',
    'mes objectifs',
    'quel est mon taux d’épargne ?',
    'mon taux d’épargne l’an dernier',
    'combien j’ai dépensé hier ?',
    'combien j’ai dépensé entre le 1er et le 15 octobre ?',
    'dépenses en carburant le trimestre dernier',
    'bonjour',
  ];

  it.each(QUESTIONS)('« %s »', async (q) => {
    const tools = fakeTools({ txs: history, budgets, goals });
    const a = await askAssistant(q, ctx, tools);
    expect(assistantAnswerSchema.safeParse(a).success).toBe(true);
    expect(a.text).not.toMatch(/undefined|NaN|Infinity|\[object/);
    for (const h of a.highlights) {
      expect(Number.isFinite(h.value)).toBe(true);
      if (h.format === 'money') expect(Number.isSafeInteger(h.value)).toBe(true);
    }
    if (a.understood) expect(tools.calls.length).toBeGreaterThan(0);
    else expect(a.suggestions.length).toBeGreaterThan(0);
  });

  it.each(QUESTIONS.slice(0, 22))('données vides : « %s » répond sans erreur', async (q) => {
    const tools = fakeTools({
      txs: [],
      budgets: [],
      goals: [],
      recurring: [],
      balances: [],
    });
    const a = await askAssistant(q, ctx, tools);
    expect(assistantAnswerSchema.safeParse(a).success).toBe(true);
    expect(a.text).not.toMatch(/undefined|NaN|Infinity/);
  });
});
