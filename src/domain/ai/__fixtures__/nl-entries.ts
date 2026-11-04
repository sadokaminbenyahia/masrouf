// Jeu de référence de la saisie en langage naturel. Aujourd'hui = mercredi 4 novembre 2026.
export const NL_TODAY = '2026-11-04';

export const NL_ACCOUNTS = [
  { id: 'acc_cash', name: 'Espèces', type: 'CASH' },
  { id: 'acc_biat', name: 'BIAT', type: 'BANK' },
  { id: 'acc_card', name: 'Carte Visa', type: 'CARD' },
];

export interface NlCase {
  text: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME';
  date: string;
  label: string;
  /** Nom de la catégorie attendue (absent : non vérifié) */
  category?: string;
  /** Compte attendu (absent : aucun compte détecté) */
  accountId?: string;
  tags?: string[];
}

/** Les cas exigés par le cahier des charges (doivent tous réussir). */
export const REQUIRED_NL_CASES: NlCase[] = [
  { text: 'café 3,500 hier', amount: 3500, type: 'EXPENSE', date: '2026-11-03', label: 'Café', category: 'Cafés' },
  { text: 'salaire 2400 le 1er', amount: 2_400_000, type: 'INCOME', date: '2026-11-01', label: 'Salaire', category: 'Salaire' },
  { text: 'taxi 7 dt', amount: 7000, type: 'EXPENSE', date: NL_TODAY, label: 'Taxi', category: 'Transport' },
  { text: 'courses carrefour 87,250 avant-hier', amount: 87_250, type: 'EXPENSE', date: '2026-11-02', label: 'Courses carrefour', category: 'Courses' },
  { text: '500 millimes pain', amount: 500, type: 'EXPENSE', date: NL_TODAY, label: 'Pain', category: 'Courses' },
  { text: 'loyer 750 le 3', amount: 750_000, type: 'EXPENSE', date: '2026-11-03', label: 'Loyer', category: 'Loyer' },
  { text: 'essence 60 lundi', amount: 60_000, type: 'EXPENSE', date: '2026-11-02', label: 'Essence', category: 'Carburant' },
  { text: '+150 remboursement Sami', amount: 150_000, type: 'INCOME', date: NL_TODAY, label: 'Remboursement Sami', category: 'Autres revenus' },
  { text: 'resto 45.5 12/03', amount: 45_500, type: 'EXPENSE', date: '2026-03-12', label: 'Resto', category: 'Restaurants' },
  { text: 'cinéma 18 dinars en espèces', amount: 18_000, type: 'EXPENSE', date: NL_TODAY, label: 'Cinéma', category: 'Loisirs', accountId: 'acc_cash' },
  { text: 'internet ooredoo 49 par carte', amount: 49_000, type: 'EXPENSE', date: NL_TODAY, label: 'Internet ooredoo', category: 'Télécom', accountId: 'acc_card' },
];

export const NL_CASES: NlCase[] = [
  ...REQUIRED_NL_CASES,
  { text: "Pizza 25 dt aujourd'hui", amount: 25_000, type: 'EXPENSE', date: NL_TODAY, label: 'Pizza', category: 'Restaurants' },
  { text: 'pharmacie 12,400', amount: 12_400, type: 'EXPENSE', date: NL_TODAY, label: 'Pharmacie', category: 'Santé' },
  { text: 'louage tunis sousse 11,5', amount: 11_500, type: 'EXPENSE', date: NL_TODAY, label: 'Louage tunis sousse', category: 'Transport' },
  { text: 'netflix 39 le 15', amount: 39_000, type: 'EXPENSE', date: '2026-10-15', label: 'Netflix', category: 'Abonnements' },
  { text: 'steg 87,400 il y a 3 jours', amount: 87_400, type: 'EXPENSE', date: '2026-11-01', label: 'Steg', category: 'Factures' },
  { text: '2 cafés 7', amount: 7000, type: 'EXPENSE', date: NL_TODAY, label: '2 cafés', category: 'Cafés' },
  { text: 'Zara 159 12 mars', amount: 159_000, type: 'EXPENSE', date: '2026-03-12', label: 'Zara', category: 'Shopping' },
  { text: 'Salle de sport 60 dt par virement', amount: 60_000, type: 'EXPENSE', date: NL_TODAY, label: 'Salle de sport', category: 'Loisirs', accountId: 'acc_biat' },
  { text: 'freelance upwork 850', amount: 850_000, type: 'INCOME', date: NL_TODAY, label: 'Freelance upwork', category: 'Freelance' },
  { text: 'métro 0,700', amount: 700, type: 'EXPENSE', date: NL_TODAY, label: 'Métro', category: 'Transport' },
  { text: 'bolt 8.4 hier soir', amount: 8400, type: 'EXPENSE', date: '2026-11-03', label: 'Bolt', category: 'Transport' },
  { text: 'cadeau mariage 200 samedi', amount: 200_000, type: 'EXPENSE', date: '2026-10-31', label: 'Cadeau mariage', category: 'Famille & cadeaux' },
  { text: "j'ai payé 30 au resto", amount: 30_000, type: 'EXPENSE', date: NL_TODAY, label: 'Resto', category: 'Restaurants' },
  { text: 'Spotify 9,990 par cb', amount: 9990, type: 'EXPENSE', date: NL_TODAY, label: 'Spotify', category: 'Abonnements', accountId: 'acc_card' },
  { text: 'Pathé 22 le 28', amount: 22_000, type: 'EXPENSE', date: '2026-10-28', label: 'Pathé', category: 'Loisirs' },
  { text: 'aziza 18,750 cash', amount: 18_750, type: 'EXPENSE', date: NL_TODAY, label: 'Aziza', category: 'Courses', accountId: 'acc_cash' },
  { text: 'Agil 50 dinars dimanche', amount: 50_000, type: 'EXPENSE', date: '2026-11-01', label: 'Agil', category: 'Carburant' },
  { text: '1 200 loyer', amount: 1_200_000, type: 'EXPENSE', date: NL_TODAY, label: 'Loyer', category: 'Loyer' },
  { text: 'dentiste 80 le 1er novembre', amount: 80_000, type: 'EXPENSE', date: '2026-11-01', label: 'Dentiste', category: 'Santé' },
  { text: 'vente vélo 250', amount: 250_000, type: 'INCOME', date: NL_TODAY, label: 'Vente vélo', category: 'Autres revenus' },
  { text: 'prime 800', amount: 800_000, type: 'INCOME', date: NL_TODAY, label: 'Prime', category: 'Autres revenus' },
  { text: 'café 2,5 #travail', amount: 2500, type: 'EXPENSE', date: NL_TODAY, label: 'Café', category: 'Cafés', tags: ['travail'] },
  { text: 'Monoprix 35,900 03/11', amount: 35_900, type: 'EXPENSE', date: '2026-11-03', label: 'Monoprix', category: 'Courses' },
  { text: 'kaskrout 3,5', amount: 3500, type: 'EXPENSE', date: NL_TODAY, label: 'Kaskrout', category: 'Restaurants' },
  { text: 'médicaments 18 dt pharmacie', amount: 18_000, type: 'EXPENSE', date: NL_TODAY, label: 'Médicaments pharmacie', category: 'Santé' },
  { text: 'école 400 le 10', amount: 400_000, type: 'EXPENSE', date: '2026-10-10', label: 'École', category: 'Éducation' },
  { text: 'abonnement shahid 19', amount: 19_000, type: 'EXPENSE', date: NL_TODAY, label: 'Abonnement shahid', category: 'Abonnements' },
  { text: 'Recharge Orange 5 dt', amount: 5000, type: 'EXPENSE', date: NL_TODAY, label: 'Recharge Orange', category: 'Télécom' },
  { text: 'bus 0,600', amount: 600, type: 'EXPENSE', date: NL_TODAY, label: 'Bus', category: 'Transport' },
  { text: 'Mabrouk 65', amount: 65_000, type: 'EXPENSE', date: NL_TODAY, label: 'Mabrouk', category: 'Shopping' },
  { text: 'gasoil 70 vendredi', amount: 70_000, type: 'EXPENSE', date: '2026-10-30', label: 'Gasoil', category: 'Carburant' },
  { text: '-20 frais bancaires', amount: 20_000, type: 'EXPENSE', date: NL_TODAY, label: 'Frais bancaires', category: 'Divers' },
  { text: '9ahwa 2', amount: 2000, type: 'EXPENSE', date: NL_TODAY, label: '9ahwa', category: 'Cafés' },
  { text: 'chahriya 1800', amount: 1_800_000, type: 'INCOME', date: NL_TODAY, label: 'Chahriya', category: 'Salaire' },
  { text: 'Taxi 12 il y a une semaine', amount: 12_000, type: 'EXPENSE', date: '2026-10-28', label: 'Taxi', category: 'Transport' },
  { text: 'épargne 200', amount: 200_000, type: 'EXPENSE', date: NL_TODAY, label: 'Épargne', category: 'Épargne' },
  { text: 'pâtisserie 35 dt avant hier', amount: 35_000, type: 'EXPENSE', date: '2026-11-02', label: 'Pâtisserie', category: 'Cafés' },
  { text: 'lablabi 4,500 ce matin', amount: 4500, type: 'EXPENSE', date: NL_TODAY, label: 'Lablabi', category: 'Restaurants' },
  { text: 'courses 120 dt avec la carte visa', amount: 120_000, type: 'EXPENSE', date: NL_TODAY, label: 'Courses', category: 'Courses', accountId: 'acc_card' },
  { text: 'virement reçu 300', amount: 300_000, type: 'INCOME', date: NL_TODAY, label: 'Reçu', accountId: 'acc_biat' },
  { text: 'Café 1,800 le 4', amount: 1800, type: 'EXPENSE', date: NL_TODAY, label: 'Café', category: 'Cafés' },
  { text: 'resto 60 le 31', amount: 60_000, type: 'EXPENSE', date: '2026-10-31', label: 'Resto', category: 'Restaurants' },
];

export const NL_FAILURES = ['café hier', 'resto le 15', '', 'il y a 3 jours taxi'];
