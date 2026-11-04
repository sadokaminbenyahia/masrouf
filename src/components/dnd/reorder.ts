/**
 * Logique pure de la liste triable : déplacement d'un identifiant, application d'un ordre
 * optimiste, et messages d'accessibilité en français (annonces du lecteur d'écran).
 */

/** Déplace `activeId` à la position de `overId`. Renvoie une copie (inchangée si un id manque). */
export function moveId(ids: readonly string[], activeId: string, overId: string): string[] {
  const from = ids.indexOf(activeId);
  const to = ids.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, activeId);
  return next;
}

/**
 * Trie `items` selon `order`. Les éléments absents de `order` (ajoutés entre-temps) gardent
 * leur ordre relatif et passent à la fin ; les ids d'`order` disparus sont ignorés.
 */
export function applyOrder<T extends { id: string }>(
  items: readonly T[],
  order: readonly string[],
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  const known: T[] = [];
  const unknown: T[] = [];
  for (const item of items) (rank.has(item.id) ? known : unknown).push(item);
  known.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  return [...known, ...unknown];
}

/** Signature stable de l'ordre d'une liste (sert à détecter un changement côté source). */
export function orderSignature(items: readonly { id: string }[]): string {
  return items.map((i) => i.id).join('|');
}

export function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

// ───────────────────────── Accessibilité (FR) ─────────────────────────

export const SCREEN_READER_INSTRUCTIONS =
  'Pour réordonner, appuyez sur Espace ou Entrée pour saisir l’élément. ' +
  'Utilisez les flèches pour le déplacer, Espace ou Entrée pour le déposer, ' +
  'ou Échap pour annuler.';

const quote = (label: string) => `« ${label} »`;

export function pickedUpMessage(label: string, position: number, total: number): string {
  return `${quote(label)} saisi, position ${position} sur ${total}. Flèches pour déplacer, Espace pour déposer, Échap pour annuler.`;
}

export function movedMessage(label: string, position: number, total: number): string {
  return `${quote(label)} déplacé en position ${position} sur ${total}.`;
}

export function droppedMessage(label: string, position: number, total: number): string {
  return `${quote(label)} déposé en position ${position} sur ${total}.`;
}

export function cancelledMessage(label: string, position: number): string {
  return `Déplacement annulé. ${quote(label)} reste en position ${position}.`;
}
