/**
 * Sélection multiple (case par ligne, Maj+clic pour une plage) : fonctions pures.
 */
export type Selection = Readonly<Record<string, boolean>>;

/**
 * Bascule `targetId`. Avec `shift` et une ancre visible, toute la plage ancre → cible
 * prend le nouvel état de la cible.
 */
export function toggleSelection(
  selection: Selection,
  rowIds: readonly string[],
  targetId: string,
  anchorId: string | null,
  shift: boolean,
): { selection: Record<string, boolean>; anchorId: string } {
  const value = !selection[targetId];
  const next: Record<string, boolean> = { ...selection };
  const a = anchorId === null ? -1 : rowIds.indexOf(anchorId);
  const b = rowIds.indexOf(targetId);
  if (shift && a >= 0 && b >= 0) {
    const [start, end] = a <= b ? [a, b] : [b, a];
    for (const id of rowIds.slice(start, end + 1)) {
      if (value) next[id] = true;
      else delete next[id];
    }
  } else if (value) {
    next[targetId] = true;
  } else {
    delete next[targetId];
  }
  return { selection: next, anchorId: targetId };
}

/** Identifiants sélectionnés parmi les lignes visibles, dans l'ordre d'affichage. */
export function selectedIds(selection: Selection, rowIds: readonly string[]): string[] {
  return rowIds.filter((id) => selection[id]);
}

/** État de la case d'en-tête. */
export function headerCheckState(
  selection: Selection,
  rowIds: readonly string[],
): boolean | 'indeterminate' {
  const n = selectedIds(selection, rowIds).length;
  if (n === 0) return false;
  return n === rowIds.length ? true : 'indeterminate';
}

/** Tout sélectionner / tout désélectionner (lignes visibles). */
export function toggleAll(
  selection: Selection,
  rowIds: readonly string[],
): Record<string, boolean> {
  if (headerCheckState(selection, rowIds) === true) return {};
  return Object.fromEntries(rowIds.map((id) => [id, true]));
}
