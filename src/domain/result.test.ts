import { describe, expect, it } from 'vitest';
import { appError, DEFAULT_ERROR_MESSAGES, err, isOk, mapResult, ok } from './result';

describe('Result', () => {
  it('construit et transforme', () => {
    const r = ok(2);
    expect(isOk(r)).toBe(true);
    expect(mapResult(r, (v) => v * 2)).toEqual({ ok: true, value: 4 });
    const e = err(appError('NOT_FOUND', 'Introuvable'));
    expect(isOk(e)).toBe(false);
    expect(mapResult(e, (v: number) => v * 2)).toBe(e);
  });

  it('erreurs typées avec champs', () => {
    expect(appError('VALIDATION', 'x', { a: ['b'] })).toEqual({
      code: 'VALIDATION',
      message: 'x',
      fieldErrors: { a: ['b'] },
    });
    expect(appError('INTERNAL', 'y')).toEqual({ code: 'INTERNAL', message: 'y' });
    expect(DEFAULT_ERROR_MESSAGES.RATE_LIMITED).toMatch(/Trop/);
  });
});
