// Propriétaire : agent J — normalisation des libellés (socle commun de l'IA)
import { notImplemented } from './_stub';

/** Minuscules, sans accents, sans préfixes bancaires (PAIEMENT CB…), dates, références. */
export function normalizeLabel(raw: string): string {
  return notImplemented(`normalizeLabel(${raw})`);
}
/** Tokens significatifs (sans mots vides), ≥ 2 caractères. */
export function tokenize(raw: string): string[] {
  return notImplemented(`tokenize(${raw})`);
}
/** Clé marchand stable : « PAIEMENT CB CARREFOUR LA MARSA 12/03 » → « carrefour marsa ». */
export function merchantKey(raw: string): string {
  return notImplemented(`merchantKey(${raw})`);
}
