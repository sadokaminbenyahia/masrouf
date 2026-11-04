import { Tag } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, isIconName } from '@/domain/icons';
import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from '@/domain/default-categories';
import { UNCATEGORIZED_ICON } from '@/domain/aggregations';
import { iconSchema } from '@/lib/schemas/common';
import { CATEGORY_ICON_NAMES, getCategoryIcon, ICON_REGISTRY } from './category-icon';

describe('registre d’icônes', () => {
  it('chaque nom de ICON_NAMES a une icône lucide, et réciproquement', () => {
    for (const name of ICON_NAMES) {
      expect(Object.hasOwn(ICON_REGISTRY, name), name).toBe(true);
      expect(getCategoryIcon(name)).toBe(ICON_REGISTRY[name]);
    }
    expect(Object.keys(ICON_REGISTRY).sort()).toEqual([...ICON_NAMES].sort());
  });

  it('icônes du seed et des catégories par défaut autorisées', () => {
    const used = [
      ...DEFAULT_CATEGORIES.map((c) => c.icon),
      UNCATEGORIZED_ICON,
      'Plane',
      'ShieldCheck',
      'PiggyBank',
    ];
    for (const name of used) {
      expect(isIconName(name), name).toBe(true);
      expect(iconSchema.safeParse(name).success, name).toBe(true);
    }
    expect(DEFAULT_ACCOUNTS.length).toBeGreaterThan(0);
  });

  it('propriétés héritées et noms inconnus : refusés (repli Tag)', () => {
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'Inconnue']) {
      expect(isIconName(name)).toBe(false);
      expect(getCategoryIcon(name)).toBe(Tag);
      expect(iconSchema.safeParse(name).success).toBe(false);
    }
  });

  it('sélecteurs : ni l’alias « Home », ni l’icône réservée « Sans catégorie »', () => {
    expect(CATEGORY_ICON_NAMES).not.toContain('Home');
    expect(CATEGORY_ICON_NAMES).not.toContain('CircleDashed');
    expect(CATEGORY_ICON_NAMES).toContain('ShieldCheck');
  });
});
