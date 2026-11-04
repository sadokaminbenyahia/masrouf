/**
 * Données de démo (idempotent) : supprime puis recrée l'utilisatrice démo avec 6 mois
 * d'historique réaliste en TND, générés RELATIVEMENT à la date du jour avec un PRNG à graine
 * fixe. Tourne sous tsx hors de Next : pas de module `server-only`, client Prisma dédié.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import {
  addDays,
  addMonths,
  addMonthsYM,
  daysInMonth,
  isoWeekday,
  listMonths,
  monthOf,
  monthStart,
  parseYearMonth,
  todayInTimeZone,
  toISODate,
  type ISODate,
  type YearMonth,
} from '../src/domain/dates';
import { DEFAULT_CATEGORIES } from '../src/domain/default-categories';
import { dinarsToMillimes } from '../src/domain/money';
import { firstOccurrenceOnOrAfter } from '../src/domain/recurring';

const prisma = new PrismaClient();

const DEMO_EMAIL = 'demo@masrouf.tn';
const DEMO_PASSWORD = 'Demo1234!';
const SEED = 0x4d415352; // « MASR »
const TODAY: ISODate = todayInTimeZone(process.env.APP_TIMEZONE ?? 'Africa/Tunis', new Date());
const MONTHS = 6;

// ───────────────────────── PRNG déterministe (mulberry32) ─────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const chance = (p: number) => rnd() < p;
const int = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rnd() * items.length)];
  if (item === undefined) throw new Error('pick : liste vide');
  return item;
}
/** Montant aléatoire en millimes entre deux valeurs en dinars, arrondi à `step` millimes. */
const amount = (minDT: number, maxDT: number, step = 100) =>
  Math.round(int(dinarsToMillimes(minDT), dinarsToMillimes(maxDT)) / step) * step;

// ───────────────────────── Modèle intermédiaire ─────────────────────────

type AccountKey = 'cash' | 'bank' | 'card';
type RuleKey = 'salary' | 'rent' | 'internet' | 'gym';

interface SeedTx {
  account: AccountKey;
  type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  amount: number;
  date: ISODate;
  label: string;
  category: string | null;
  to?: AccountKey;
  rule?: RuleKey;
  tags?: string[];
  note?: string;
}

const months: YearMonth[] = listMonths(addMonthsYM(monthOf(TODAY), -(MONTHS - 1)), monthOf(TODAY));
const START: ISODate = monthStart(months[0] ?? monthOf(TODAY));
const currentMonth = monthOf(TODAY);

/** Jour `day` du mois `ym` (borné à la fin du mois), ou null s'il est hors de [START, TODAY]. */
function dayOf(ym: YearMonth, day: number): ISODate | null {
  const { year, month } = parseYearMonth(ym);
  const d = toISODate(year, month, Math.min(day, daysInMonth(year, month)));
  return d >= START && d <= TODAY ? d : null;
}

function generate(): SeedTx[] {
  const txs: SeedTx[] = [];
  const add = (t: SeedTx) => txs.push(t);

  // Charges et revenus mensuels.
  months.forEach((ym, i) => {
    const on = (day: number, fn: (d: ISODate) => void) => {
      const d = dayOf(ym, day);
      if (d) fn(d);
    };
    on(1, (date) =>
      add({
        account: 'bank',
        type: 'INCOME',
        amount: dinarsToMillimes(2600),
        date,
        label: 'Virement salaire',
        category: 'Salaire',
        rule: 'salary',
      }),
    );
    on(2, (date) =>
      add({
        account: 'bank',
        type: 'TRANSFER',
        to: 'card',
        amount: dinarsToMillimes(650),
        date,
        label: 'Alimentation carte Visa',
        category: null,
      }),
    );
    on(3, (date) =>
      add({
        account: 'bank',
        type: 'EXPENSE',
        amount: dinarsToMillimes(750),
        date,
        label: 'Loyer appartement',
        category: 'Loyer',
        rule: 'rent',
      }),
    );
    on(4, (date) =>
      add({
        account: 'bank',
        type: 'EXPENSE',
        amount: dinarsToMillimes(150),
        date,
        label: 'Virement épargne',
        category: 'Épargne',
      }),
    );
    on(5, (date) =>
      add({
        account: 'bank',
        type: 'EXPENSE',
        amount: dinarsToMillimes(45),
        date,
        label: 'Internet Ooredoo',
        category: 'Télécom',
        rule: 'internet',
      }),
    );
    on(10, (date) =>
      add({
        account: 'card',
        type: 'EXPENSE',
        amount: dinarsToMillimes(60),
        date,
        label: 'Salle de sport California Gym',
        category: 'Loisirs',
        rule: 'gym',
      }),
    );
    // Abonnement streaming NON déclaré en récurrent (→ « abonnement oublié »).
    on(12, (date) =>
      add({
        account: 'card',
        type: 'EXPENSE',
        amount: dinarsToMillimes(33),
        date,
        label: 'NETFLIX.COM',
        category: 'Abonnements',
      }),
    );
    if (i % 2 === 0) {
      on(15, (date) =>
        add({
          account: 'bank',
          type: 'EXPENSE',
          amount: amount(85, 140),
          date,
          label: 'STEG facture électricité',
          category: 'Factures',
        }),
      );
    }
    if (i % 3 === 1) {
      on(20, (date) =>
        add({
          account: 'bank',
          type: 'EXPENSE',
          amount: amount(28, 45),
          date,
          label: 'SONEDE facture eau',
          category: 'Factures',
        }),
      );
    }
    if (i % 2 === 1) {
      on(18, (date) =>
        add({
          account: 'bank',
          type: 'INCOME',
          amount: amount(350, 600, 1000),
          date,
          label: 'Virement reçu mission freelance',
          category: 'Freelance',
        }),
      );
    }
    // Retraits DAB = virements BIAT → Espèces.
    for (const day of [6, 16, 25]) {
      on(day, (date) =>
        add({
          account: 'bank',
          type: 'TRANSFER',
          to: 'cash',
          amount: amount(190, 260, 10_000),
          date,
          label: 'Retrait DAB BIAT',
          category: null,
        }),
      );
    }
  });

  // Dépenses courantes, jour par jour.
  for (let d = START; d <= TODAY; d = addDays(d, 1)) {
    const weekend = isoWeekday(d) >= 6;
    if (chance(0.85)) {
      add({
        account: 'cash',
        type: 'EXPENSE',
        amount: int(3, 9) * 500,
        date: d,
        label: pick(['Café Mrabet', 'Café de Paris', 'Café El Ali', 'Café Slim']),
        category: 'Cafés',
      });
    }
    if (chance(0.28)) {
      const shop = pick([
        { label: 'Carrefour La Marsa', account: 'card' as const },
        { label: 'Monoprix Lafayette', account: 'card' as const },
        { label: 'Aziza', account: 'cash' as const },
        { label: 'Magasin Général', account: 'cash' as const },
      ]);
      add({
        account: shop.account,
        type: 'EXPENSE',
        amount: amount(15, 65),
        date: d,
        label: shop.label,
        category: 'Courses',
      });
    }
    if (!weekend && chance(0.5)) {
      const ride = pick([
        { label: 'Louage Tunis - Nabeul', min: 7, max: 14 },
        { label: 'Taxi', min: 4, max: 12 },
        { label: 'Ticket métro TRANSTU', min: 0.7, max: 1.4 },
      ]);
      add({
        account: 'cash',
        type: 'EXPENSE',
        amount: amount(ride.min, ride.max),
        date: d,
        label: ride.label,
        category: 'Transport',
      });
    }
    if (chance(0.08)) {
      add({
        account: 'card',
        type: 'EXPENSE',
        amount: amount(45, 75, 1000),
        date: d,
        label: pick(['Station Agil', 'Shell Ennasr']),
        category: 'Carburant',
      });
    }
    if (chance(weekend ? 0.3 : 0.1)) {
      add({
        account: pick(['card', 'cash'] as const),
        type: 'EXPENSE',
        amount: amount(18, 48, 500),
        date: d,
        label: pick([
          'Restaurant Le Golfe',
          'Pizzeria Napoli',
          'Chapati El Bey',
          'Lablabi Ennasr',
          'Plan B Lac',
        ]),
        category: 'Restaurants',
        ...(weekend ? { tags: ['sortie'] } : {}),
      });
    }
    if (chance(0.045)) {
      add({
        account: 'card',
        type: 'EXPENSE',
        amount: amount(30, 100, 500),
        date: d,
        label: pick(['Zara Tunis City', 'Jumia.com.tn', 'Mabrouk', 'Décathlon']),
        category: 'Shopping',
      });
    }
    if (chance(0.04)) {
      add({
        account: 'cash',
        type: 'EXPENSE',
        amount: amount(8, 45),
        date: d,
        label: 'Pharmacie Pasteur',
        category: 'Santé',
      });
    }
    if (chance(0.06)) {
      add({
        account: 'cash',
        type: 'EXPENSE',
        amount: pick([10_000, 20_000]),
        date: d,
        label: 'Recharge téléphone Orange',
        category: 'Télécom',
      });
    }
    if (chance(0.025)) {
      add({
        account: 'card',
        type: 'EXPENSE',
        amount: amount(12, 18, 500),
        date: d,
        label: 'Cinéma Pathé Tunis City',
        category: 'Loisirs',
        tags: ['sortie'],
      });
    }
    if (chance(0.025)) {
      add({
        account: 'cash',
        type: 'EXPENSE',
        amount: amount(30, 110, 1000),
        date: d,
        label: pick(['Pâtisserie Masmoudi', 'Cadeau anniversaire']),
        category: 'Famille & cadeaux',
        tags: ['famille'],
      });
    }
    if (chance(0.012)) {
      add({
        account: 'card',
        type: 'EXPENSE',
        amount: amount(25, 60, 500),
        date: d,
        label: 'Librairie Al Kitab',
        category: 'Éducation',
      });
    }
    if (chance(0.02)) {
      add({
        account: 'cash',
        type: 'EXPENSE',
        amount: amount(5, 30, 500),
        date: d,
        label: 'Quincaillerie',
        category: 'Divers',
      });
    }
  }

  // Hausse d'abonnement : la DERNIÈRE facture Internet passe de 45 à 49 DT.
  const internet = txs
    .filter((t) => t.rule === 'internet')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const lastInternet = internet[internet.length - 1];
  if (lastInternet) lastInternet.amount = dinarsToMillimes(49);

  // Dépense inhabituelle : restaurant à 380 DT, il y a 12 jours.
  const unusual = addDays(TODAY, -12);
  if (unusual >= START) {
    add({
      account: 'card',
      type: 'EXPENSE',
      amount: dinarsToMillimes(380),
      date: unusual,
      label: 'Restaurant Dar El Jeld',
      category: 'Restaurants',
      tags: ['anniversaire'],
      note: 'Dîner d’anniversaire',
    });
  }

  // Doublon : le même café saisi deux fois le même jour, il y a 3 jours.
  const dup = addDays(TODAY, -3);
  if (dup >= START) {
    for (let i = txs.length - 1; i >= 0; i--) {
      const t = txs[i];
      if (t && t.date === dup && t.category === 'Cafés') txs.splice(i, 1);
    }
    for (let k = 0; k < 2; k++) {
      add({
        account: 'cash',
        type: 'EXPENSE',
        amount: 2_500,
        date: dup,
        label: 'Café Mrabet',
        category: 'Cafés',
      });
    }
  }
  return txs;
}

// ───────────────────────── Budgets du mois courant ─────────────────────────

const BUDGETS: readonly { category: string; dinars: number }[] = [
  { category: 'Courses', dinars: 450 },
  { category: 'Restaurants', dinars: 150 },
  { category: 'Cafés', dinars: 90 },
  { category: 'Transport', dinars: 120 },
  { category: 'Loisirs', dinars: 100 },
  { category: 'Shopping', dinars: 150 },
];

const spentThisMonth = (txs: readonly SeedTx[], category: string) =>
  txs
    .filter(
      (t) => t.type === 'EXPENSE' && t.category === category && monthOf(t.date) === currentMonth,
    )
    .reduce((s, t) => s + t.amount, 0);

interface PoolItem {
  label: string;
  min: number;
  max: number;
  account: AccountKey;
  tags?: string[];
}

/**
 * Amène la dépense du mois courant d'une catégorie entre `lo` et `hi` × plafond, avec des
 * achats plausibles : plusieurs petits montants (dans les fourchettes habituelles du
 * générateur, donc sans fausse anomalie), répartis sur les jours déjà écoulés du mois.
 */
function fillBudget(
  txs: SeedTx[],
  category: string,
  budgetDT: number,
  lo: number,
  hi: number,
  pool: readonly PoolItem[],
): void {
  const plafond = dinarsToMillimes(budgetDT);
  const isRemovable = (t: SeedTx) => t.category === category && monthOf(t.date) === currentMonth;
  while (spentThisMonth(txs, category) > plafond * hi) {
    const idx = txs.findIndex(isRemovable);
    if (idx < 0) break;
    txs.splice(idx, 1);
  }
  const elapsed = Math.max(1, Number(TODAY.slice(8)));
  for (let k = 0; k < 40 && spentThisMonth(txs, category) < plafond * lo; k++) {
    const spent = spentThisMonth(txs, category);
    const item = pick(pool);
    const room = Math.floor((plafond * hi - spent) / 500) * 500;
    const value = Math.min(amount(item.min, item.max, 500), room);
    if (value < 1_000) break;
    txs.push({
      account: item.account,
      type: 'EXPENSE',
      amount: value,
      // Du jour le plus récent vers le début du mois, un achat par jour (puis on reboucle).
      date: addDays(TODAY, -(k % elapsed)),
      label: item.label,
      category,
      ...(item.tags ? { tags: item.tags } : {}),
    });
  }
}

/**
 * Garantit au moins un budget dépassé (EXCEEDED, 105–125 %) et un en alerte (WARNING,
 * 80–95 %) ce mois-ci, quel que soit le jour du mois, avec des achats réalistes :
 *  - EXCEEDED : Loisirs (petit plafond, 100 DT) — sorties de quelques dizaines de dinars ;
 *  - WARNING : Courses à partir du 10 du mois (plafond de 450 DT, atteint par plusieurs
 *    courses), sinon Restaurants (150 DT), atteignable en quelques repas en début de mois.
 */
function enforceBudgetLevels(txs: SeedTx[]): void {
  fillBudget(txs, 'Loisirs', 100, 1.05, 1.25, [
    { label: 'Cinéma Pathé Tunis City', min: 12, max: 18, account: 'card', tags: ['sortie'] },
    { label: 'Bowling du Lac', min: 18, max: 28, account: 'card', tags: ['sortie'] },
    { label: 'Escape game Tunis', min: 25, max: 35, account: 'card', tags: ['sortie'] },
    { label: 'Concert au Théâtre municipal', min: 30, max: 45, account: 'card', tags: ['sortie'] },
  ]);
  const day = Number(TODAY.slice(8));
  if (day >= 10) {
    fillBudget(txs, 'Courses', 450, 0.8, 0.95, [
      { label: 'Carrefour La Marsa', min: 20, max: 60, account: 'card' },
      { label: 'Monoprix Lafayette', min: 15, max: 55, account: 'card' },
      { label: 'Aziza', min: 15, max: 45, account: 'cash' },
      { label: 'Magasin Général', min: 20, max: 60, account: 'cash' },
    ]);
  } else {
    fillBudget(txs, 'Restaurants', 150, 0.8, 0.95, [
      { label: 'Restaurant Le Golfe', min: 30, max: 48, account: 'card', tags: ['sortie'] },
      { label: 'Pizzeria Napoli', min: 22, max: 40, account: 'card' },
      { label: 'Plan B Lac', min: 28, max: 45, account: 'card', tags: ['sortie'] },
      { label: 'Chapati El Bey', min: 18, max: 30, account: 'cash' },
    ]);
  }
}

// ───────────────────────── Écriture en base ─────────────────────────

async function main(): Promise<void> {
  await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });

  const user = await prisma.user.create({
    data: {
      email: DEMO_EMAIL,
      name: 'Yasmine',
      passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12),
      onboardedAt: new Date(),
    },
  });
  const userId = user.id;

  const accountDefs: Record<
    AccountKey,
    { name: string; type: string; initial: number; color: string; sortOrder: number }
  > = {
    cash: { name: 'Espèces', type: 'CASH', initial: 120, color: '#15803D', sortOrder: 0 },
    bank: { name: 'BIAT', type: 'BANK', initial: 3400, color: '#1F5FAD', sortOrder: 1 },
    card: { name: 'Carte Visa', type: 'CARD', initial: 150, color: '#B356C9', sortOrder: 2 },
  };
  const accountIds = {} as Record<AccountKey, string>;
  for (const key of ['cash', 'bank', 'card'] as const) {
    const a = accountDefs[key];
    const row = await prisma.account.create({
      data: {
        userId,
        name: a.name,
        type: a.type,
        initialBalance: dinarsToMillimes(a.initial),
        color: a.color,
        sortOrder: a.sortOrder,
      },
    });
    accountIds[key] = row.id;
  }

  await prisma.category.createMany({ data: DEFAULT_CATEGORIES.map((c) => ({ ...c, userId })) });
  const categoryIds = new Map(
    (await prisma.category.findMany({ where: { userId }, select: { id: true, name: true } })).map(
      (c) => [c.name, c.id],
    ),
  );
  const categoryId = (name: string): string => {
    const id = categoryIds.get(name);
    if (!id) throw new Error(`Catégorie par défaut manquante : ${name}`);
    return id;
  };

  const txs = generate();
  enforceBudgetLevels(txs);
  txs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // Récurrences (déclarées) : la prochaine échéance est dans le futur.
  const ruleDefs: Record<
    RuleKey,
    { label: string; type: 'EXPENSE' | 'INCOME'; category: string; account: AccountKey }
  > = {
    salary: { label: 'Salaire', type: 'INCOME', category: 'Salaire', account: 'bank' },
    rent: { label: 'Loyer', type: 'EXPENSE', category: 'Loyer', account: 'bank' },
    internet: { label: 'Internet Ooredoo', type: 'EXPENSE', category: 'Télécom', account: 'bank' },
    gym: { label: 'Salle de sport', type: 'EXPENSE', category: 'Loisirs', account: 'card' },
  };
  const ruleIds = {} as Record<RuleKey, string>;
  for (const key of ['salary', 'rent', 'internet', 'gym'] as const) {
    const def = ruleDefs[key];
    const series = txs.filter((t) => t.rule === key);
    const first = series[0];
    const last = series[series.length - 1];
    if (!first || !last)
      throw new Error(`Aucune occurrence générée pour la récurrence ${def.label}`);
    const startDate = first.date;
    const nextDate = firstOccurrenceOnOrAfter(
      { frequency: 'MONTHLY', startDate },
      addDays(TODAY, 1),
    );
    const row = await prisma.recurringRule.create({
      data: {
        userId,
        accountId: accountIds[def.account],
        categoryId: categoryId(def.category),
        type: def.type,
        amount: last.amount,
        label: def.label,
        frequency: 'MONTHLY',
        startDate,
        nextDate,
        active: true,
        autoCreate: true,
      },
    });
    ruleIds[key] = row.id;
  }

  // Transactions : en masse, sauf celles portant des tags (relation n-n).
  const toData = (t: SeedTx, i: number) => ({
    userId,
    accountId: accountIds[t.account],
    categoryId: t.category === null ? null : categoryId(t.category),
    type: t.type,
    amount: t.amount,
    date: t.date,
    label: t.label,
    note: t.note ?? null,
    transferAccountId: t.to ? accountIds[t.to] : null,
    recurringId: t.rule ? ruleIds[t.rule] : null,
    categorySource: t.category === null ? null : 'SEED',
    // Horodatage plausible (ordre d'ajout stable au sein d'une journée).
    createdAt: new Date(Date.parse(`${t.date}T08:00:00.000Z`) + i * 1000),
  });
  const plain = txs.map((t, i) => ({ t, i })).filter(({ t }) => !t.tags || t.tags.length === 0);
  const tagged = txs.map((t, i) => ({ t, i })).filter(({ t }) => t.tags && t.tags.length > 0);
  await prisma.transaction.createMany({ data: plain.map(({ t, i }) => toData(t, i)) });
  for (const { t, i } of tagged) {
    await prisma.transaction.create({
      data: {
        ...toData(t, i),
        tags: {
          connectOrCreate: (t.tags ?? []).map((name) => ({
            where: { userId_name: { userId, name } },
            create: { userId, name },
          })),
        },
      },
    });
  }

  await prisma.budget.createMany({
    data: BUDGETS.map((b, sortOrder) => ({
      userId,
      categoryId: categoryId(b.category),
      amount: dinarsToMillimes(b.dinars),
      sortOrder,
    })),
  });

  await prisma.goal.createMany({
    data: [
      {
        userId,
        name: 'Voyage à Djerba',
        targetAmount: dinarsToMillimes(1500),
        savedAmount: dinarsToMillimes(600),
        targetDate: addMonths(TODAY, 5),
        icon: 'Plane',
        color: '#0E9AA7',
        sortOrder: 0,
      },
      {
        userId,
        name: "Fonds d'urgence",
        targetAmount: dinarsToMillimes(6000),
        savedAmount: dinarsToMillimes(2100),
        targetDate: null,
        icon: 'ShieldCheck',
        color: '#3A9E8C',
        sortOrder: 1,
      },
    ],
  });

  // Résumé.
  const count = await prisma.transaction.count({ where: { userId } });
  const levels = BUDGETS.map((b) => {
    const ratio = spentThisMonth(txs, b.category) / dinarsToMillimes(b.dinars);
    const level = ratio >= 1 ? 'EXCEEDED' : ratio >= 0.8 ? 'WARNING' : 'OK';
    return `${b.category} ${Math.round(ratio * 100)} % (${level})`;
  });
  console.log(`Seed terminé (${TODAY}) : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(
    `  ${count} transactions du ${START} au ${TODAY}, 3 comptes, ${DEFAULT_CATEGORIES.length} catégories`,
  );
  console.log(`  ${BUDGETS.length} budgets ce mois-ci : ${levels.join(', ')}`);
  console.log('  2 objectifs, 4 récurrences');
}

main()
  .catch((e: unknown) => {
    console.error('Échec du seed :', e);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
