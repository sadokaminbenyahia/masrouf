import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from './config';
import { prisma } from '@/server/db';

/** Identifiant de l'utilisateur connecté (vérifié en base), ou null. */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  return exists?.id ?? null;
}

/** Pour les pages RSC : renvoie l'utilisateur connecté ou redirige vers /connexion. */
export async function requireUserId(): Promise<string> {
  const id = await getCurrentUserId();
  if (!id) redirect('/connexion');
  return id;
}
