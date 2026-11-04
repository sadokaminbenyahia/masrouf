import { describe, expect, it } from 'vitest';
import { safeInternalPath } from './safe-redirect';

describe('safeInternalPath', () => {
  it.each([
    ['/transactions?q=café', '/transactions?q=caf%C3%A9'],
    ['/budgets', '/budgets'],
  ])('accepte %s', (raw, expected) => {
    expect(safeInternalPath(raw)).toBe(expected);
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    '/connexion',
    '/connexion/x',
    '/inscription',
    '/api/export/transactions',
    '',
    42,
    undefined,
    `/${'a'.repeat(600)}`,
  ])('refuse %s', (raw) => {
    expect(safeInternalPath(raw)).toBe('/tableau-de-bord');
  });
});
