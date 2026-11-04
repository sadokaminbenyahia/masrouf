import 'server-only';
import type { Tag } from '@/domain/types';
import { prisma } from '@/server/db';

export async function listTags(userId: string): Promise<Tag[]> {
  const rows = await prisma.tag.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  return rows;
}

/**
 * Relations « tags » d'une transaction : upsert par (userId, name).
 * À utiliser dans `data.tags` d'un create/update Prisma.
 */
export function connectOrCreateTags(userId: string, names: readonly string[]) {
  return names.map((name) => ({
    where: { userId_name: { userId, name } },
    create: { userId, name },
  }));
}
