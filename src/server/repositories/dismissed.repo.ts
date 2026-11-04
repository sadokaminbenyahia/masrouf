import 'server-only';
import { prisma } from '@/server/db';

/** Clés des anomalies / conseils ignorés par l'utilisateur. */
export async function listDismissedKeys(userId: string): Promise<string[]> {
  const rows = await prisma.dismissedInsight.findMany({ where: { userId }, select: { key: true } });
  return rows.map((r) => r.key);
}

export async function addDismissedKey(userId: string, key: string): Promise<void> {
  await prisma.dismissedInsight.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key },
    update: {},
  });
}

export async function removeDismissedKey(userId: string, key: string): Promise<void> {
  await prisma.dismissedInsight.deleteMany({ where: { userId, key } });
}
