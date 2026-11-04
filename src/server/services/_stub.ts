import 'server-only';
/** Phase 1 uniquement : à supprimer quand tous les services sont implémentés. */
export function notImplemented(name: string): never {
  throw new Error(`Service non implémenté : ${name}`);
}
