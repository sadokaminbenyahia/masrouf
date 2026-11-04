/**
 * Dernier compte utilisé pour une saisie (préférence locale au navigateur).
 * Le stockage peut être indisponible (navigation privée, quota) : on l'ignore alors.
 */
const STORAGE_KEY = 'masrouf:last-account-id';

export function readLastAccountId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeLastAccountId(id: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Stockage indisponible : la préférence n'est simplement pas mémorisée.
  }
}
