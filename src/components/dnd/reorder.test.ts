import { describe, expect, it } from 'vitest';
import {
  applyOrder,
  cancelledMessage,
  droppedMessage,
  moveId,
  movedMessage,
  orderSignature,
  pickedUpMessage,
  sameOrder,
} from './reorder';

const ids = ['a', 'b', 'c', 'd'];

describe('moveId', () => {
  it('déplace vers le bas', () => {
    expect(moveId(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('déplace vers le haut', () => {
    expect(moveId(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });
  it('ne modifie pas la source et ignore les ids inconnus', () => {
    const copy = moveId(ids, 'x', 'b');
    expect(copy).toEqual(ids);
    expect(copy).not.toBe(ids);
    expect(moveId(ids, 'b', 'b')).toEqual(ids);
  });
});

describe('applyOrder', () => {
  const items = ids.map((id) => ({ id }));
  it("applique l'ordre optimiste", () => {
    expect(applyOrder(items, ['c', 'a', 'd', 'b']).map((i) => i.id)).toEqual(['c', 'a', 'd', 'b']);
  });
  it('place les nouveaux éléments à la fin et ignore les disparus', () => {
    const next = [...items, { id: 'e' }].filter((i) => i.id !== 'b');
    expect(applyOrder(next, ['d', 'b', 'c', 'a']).map((i) => i.id)).toEqual(['d', 'c', 'a', 'e']);
  });
});

describe('signature et comparaison', () => {
  it("détecte un changement d'ordre", () => {
    expect(orderSignature([{ id: 'a' }, { id: 'b' }])).toBe('a|b');
    expect(sameOrder(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(sameOrder(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(sameOrder(['a'], ['a', 'b'])).toBe(false);
  });
});

describe('annonces en français', () => {
  it('décrit chaque étape avec la position', () => {
    expect(pickedUpMessage('Courses', 1, 4)).toContain('« Courses » saisi, position 1 sur 4');
    expect(movedMessage('Courses', 3, 4)).toBe('« Courses » déplacé en position 3 sur 4.');
    expect(droppedMessage('Courses', 3, 4)).toBe('« Courses » déposé en position 3 sur 4.');
    expect(cancelledMessage('Courses', 1)).toBe(
      'Déplacement annulé. « Courses » reste en position 1.',
    );
  });
});
