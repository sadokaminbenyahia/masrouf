// Catégories par défaut (CONTRACTS §8) pour les tests du moteur IA.
import type { AiCategory } from '../types';

const EXPENSE_NAMES = [
  'Courses',
  'Restaurants',
  'Cafés',
  'Transport',
  'Carburant',
  'Loyer',
  'Factures',
  'Télécom',
  'Santé',
  'Shopping',
  'Loisirs',
  'Abonnements',
  'Éducation',
  'Famille & cadeaux',
  'Épargne',
  'Divers',
] as const;
const INCOME_NAMES = ['Salaire', 'Freelance', 'Autres revenus'] as const;

export const DEFAULT_TEST_CATEGORIES: AiCategory[] = [
  ...EXPENSE_NAMES.map((name, i) => ({ id: `cat_e${i}`, name, kind: 'EXPENSE' as const })),
  ...INCOME_NAMES.map((name, i) => ({ id: `cat_i${i}`, name, kind: 'INCOME' as const })),
];

export function categoryId(name: string): string {
  const c = DEFAULT_TEST_CATEGORIES.find((x) => x.name === name);
  if (!c) throw new Error(`Catégorie de test inconnue : ${name}`);
  return c.id;
}

export function categoryKind(name: string): 'EXPENSE' | 'INCOME' {
  return (INCOME_NAMES as readonly string[]).includes(name) ? 'INCOME' : 'EXPENSE';
}
