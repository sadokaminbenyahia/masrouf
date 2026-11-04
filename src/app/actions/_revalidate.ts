import 'server-only';
import { revalidatePath } from 'next/cache';

/** Invalide le rendu serveur de toutes les pages de l'app après une mutation. */
export function revalidateApp(): void {
  revalidatePath('/', 'layout');
}
