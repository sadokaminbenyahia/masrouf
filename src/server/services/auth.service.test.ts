import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { appError, err, ok, type Result } from '@/domain/result';

const findUserIdByEmail = vi.fn<(email: string) => Promise<string | null>>(async () => null);
const createUser = vi.fn(async (d: { email: string }) => ({ id: 'u_new', email: d.email }));
const deleteUser = vi.fn(async () => undefined);
const bootstrapUser = vi.fn<(userId: string) => Promise<Result<void>>>(async () => ok(undefined));

vi.mock('@/server/db', () => ({ prisma: {} }));
vi.mock('@/server/auth/password', () => ({ hashPassword: vi.fn(async () => 'hash') }));
vi.mock('@/server/repositories/user.repo', () => ({ findUserIdByEmail, createUser, deleteUser }));
vi.mock('./user.service', () => ({ bootstrapUser }));

const auth = await import('./auth.service');
const input = { email: 'a@b.tn', name: 'Amel', password: 'Secret123!' };

describe('auth.service.registerUser (accès base via user.repo uniquement)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crée le compte puis les données par défaut', async () => {
    expect(await auth.registerUser(input)).toEqual({
      ok: true,
      value: { id: 'u_new', email: 'a@b.tn' },
    });
    expect(createUser).toHaveBeenCalledWith({ email: 'a@b.tn', name: 'Amel', passwordHash: 'hash' });
    expect(bootstrapUser).toHaveBeenCalledWith('u_new');
  });

  it('e-mail déjà pris (ou course P2002) : CONFLICT générique', async () => {
    findUserIdByEmail.mockResolvedValueOnce('u_old');
    const taken = await auth.registerUser(input);
    expect(taken).toEqual({
      ok: false,
      error: { code: 'CONFLICT', message: auth.REGISTER_CONFLICT_MESSAGE },
    });
    expect(createUser).not.toHaveBeenCalled();

    createUser.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 't' }),
    );
    const race = await auth.registerUser(input);
    expect(!race.ok && race.error.message).toBe(auth.REGISTER_CONFLICT_MESSAGE);
  });

  it('échec du bootstrap : le compte incomplet est supprimé', async () => {
    bootstrapUser.mockResolvedValueOnce(err(appError('INTERNAL', 'x')));
    const r = await auth.registerUser(input);
    expect(r.ok).toBe(false);
    expect(deleteUser).toHaveBeenCalledWith('u_new');
  });
});
