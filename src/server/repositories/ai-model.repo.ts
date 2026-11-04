// Propriétaire : agent J. Persistance des modèles IA (JSON) par (userId, kind).
import 'server-only';
import { prisma } from '@/server/db';

export type AiModelKind = 'categorizer';

export interface StoredAiModel {
  version: number;
  /** JSON brut, à valider (Zod) avant usage */
  data: string;
  updatedAt: Date;
}

export async function loadAiModel(
  userId: string,
  kind: AiModelKind,
): Promise<StoredAiModel | null> {
  return prisma.aiModel.findFirst({
    where: { userId, kind },
    select: { version: true, data: true, updatedAt: true },
  });
}

export async function saveAiModel(
  userId: string,
  kind: AiModelKind,
  version: number,
  data: string,
): Promise<void> {
  await prisma.aiModel.upsert({
    where: { userId_kind: { userId, kind } },
    create: { userId, kind, version, data },
    update: { version, data },
  });
}

export async function deleteAiModel(userId: string, kind: AiModelKind): Promise<void> {
  await prisma.aiModel.deleteMany({ where: { userId, kind } });
}
