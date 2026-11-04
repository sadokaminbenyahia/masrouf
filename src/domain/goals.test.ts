import { describe, expect, it } from 'vitest';
import {
  applyContribution,
  completionDate,
  computeGoalProgress,
  monthsUntil,
  sortGoals,
} from './goals';
import type { Goal } from './types';

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g',
  name: 'Voyage',
  targetAmount: 1_500_000,
  savedAmount: 600_000,
  targetDate: '2027-04-04',
  icon: 'Plane',
  color: '#000000',
  sortOrder: 0,
  completedAt: null,
  ...over,
});

describe('monthsUntil', () => {
  it('compte les mois entiers restants', () => {
    expect(monthsUntil('2026-11-04', '2027-04-04')).toBe(5);
    expect(monthsUntil('2026-11-04', '2027-04-03')).toBe(4);
    expect(monthsUntil('2026-11-04', '2026-11-30')).toBe(0);
    expect(monthsUntil('2026-11-04', '2026-10-01')).toBe(0);
  });
});

describe('computeGoalProgress', () => {
  it('ON_TRACK avec épargne mensuelle nécessaire arrondie au millime supérieur', () => {
    const p = computeGoalProgress(goal({ savedAmount: 600_001 }), '2026-11-04');
    expect(p.remaining).toBe(899_999);
    expect(p.monthsLeft).toBe(5);
    expect(p.monthlyNeeded).toBe(180_000);
    expect(p.status).toBe('ON_TRACK');
    expect(p.ratio).toBeCloseTo(0.4);
  });

  it('AT_RISK si la capacité d’épargne est insuffisante', () => {
    expect(computeGoalProgress(goal(), '2026-11-04', { monthlyCapacity: 100_000 }).status).toBe(
      'AT_RISK',
    );
    expect(computeGoalProgress(goal(), '2026-11-04', { monthlyCapacity: -50_000 }).status).toBe(
      'AT_RISK',
    );
    expect(computeGoalProgress(goal(), '2026-11-04', { monthlyCapacity: 400_000 }).status).toBe(
      'ON_TRACK',
    );
    expect(computeGoalProgress(goal(), '2026-11-04', { monthlyCapacity: null }).status).toBe(
      'ON_TRACK',
    );
  });

  it('échéance dans le mois : tout le reste est nécessaire', () => {
    const p = computeGoalProgress(goal({ targetDate: '2026-11-20' }), '2026-11-04');
    expect(p.monthsLeft).toBe(0);
    expect(p.monthlyNeeded).toBe(900_000);
  });

  it('COMPLETED, NO_DEADLINE, OVERDUE', () => {
    const done = computeGoalProgress(goal({ savedAmount: 1_600_000 }), '2026-11-04');
    expect(done.status).toBe('COMPLETED');
    expect(done.remaining).toBe(0);
    expect(done.monthlyNeeded).toBeNull();

    const open = computeGoalProgress(goal({ targetDate: null }), '2026-11-04');
    expect(open.status).toBe('NO_DEADLINE');
    expect(open.monthsLeft).toBeNull();
    expect(open.monthlyNeeded).toBeNull();

    const late = computeGoalProgress(goal({ targetDate: '2026-10-01' }), '2026-11-04');
    expect(late.status).toBe('OVERDUE');
    expect(late.monthlyNeeded).toBe(900_000);
  });

  it('cible nulle : ratio 0 sans division par zéro', () => {
    expect(computeGoalProgress(goal({ targetAmount: 0, savedAmount: 0 }), '2026-11-04').ratio).toBe(
      0,
    );
  });
});

describe('applyContribution', () => {
  const now = '2026-11-04T10:00:00.000Z';
  it('ajoute un versement et marque l’atteinte', () => {
    expect(applyContribution(goal(), 900_000, now)).toEqual({
      savedAmount: 1_500_000,
      completedAt: now,
    });
  });
  it('borne à 0 lors d’un retrait', () => {
    expect(applyContribution(goal(), -1_000_000, now)).toEqual({
      savedAmount: 0,
      completedAt: null,
    });
  });
  it('remet completedAt à null quand on redescend sous la cible', () => {
    const g = goal({ savedAmount: 1_500_000, completedAt: '2026-01-01T00:00:00.000Z' });
    expect(applyContribution(g, -1, now).completedAt).toBeNull();
    expect(applyContribution(g, 10, now).completedAt).toBe('2026-01-01T00:00:00.000Z');
  });
  it('completionDate', () => {
    expect(completionDate(10, 10, null, now)).toBe(now);
    expect(completionDate(9, 10, now, now)).toBeNull();
  });
});

describe('sortGoals', () => {
  it('trie par sortOrder puis nom', () => {
    expect(
      sortGoals([
        goal({ id: 'b', name: 'B', sortOrder: 1 }),
        goal({ id: 'a', name: 'A', sortOrder: 1 }),
        goal({ id: 'c', name: 'C', sortOrder: 0 }),
      ]).map((g) => g.id),
    ).toEqual(['c', 'a', 'b']);
  });
});
