import { describe, expect, it, vi } from 'vitest';
import { ok } from '@/domain/result';
import { settle } from './settle';

describe('settle', () => {
  it('renvoie le Result du service', async () => {
    await expect(settle('t', async () => ok(1))).resolves.toEqual({ ok: true, value: 1 });
  });

  it('convertit une exception en INTERNAL', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const r = await settle('t', async () => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('INTERNAL');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
