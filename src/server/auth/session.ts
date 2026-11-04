import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from './config';
import { prisma } from '@/server/db';

/**
 * Identifiant de l'utilisateur connecté, ou null. Le JWT est vérifié PUIS confronté à la
 * base : l'utilisateur doit exister et la version de session du jeton doit être la version
 * courante (incrémentée par « Se déconnecter de tous les appareils »).
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, sessionVersion: true },
  });
  if (!user || user.sessionVersion !== (session.user.sessionVersion ?? 0)) return null;
  return user.id;
}

/** Pour les pages RSC : renvoie l'utilisateur connecté ou redirige vers /connexion. */
export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) redirect('/connexion');
  return id;
}

/** Révoque toutes les sessions existantes de l'utilisateur (tous appareils). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}
