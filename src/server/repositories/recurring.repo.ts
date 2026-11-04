import 'server-only';
import type { RecurringRule as RecurringRow } from '@prisma/client';
import { isISODate, type ISODate } from '@/domain/dates';
import { FREQUENCIES, type Frequency, type RecurringRule } from '@/domain/types';
import { prisma } from '@/server/db';
import { DataIntegrityError, parseEnum, type Db } from './_shared';

const FLOW_TYPES = ['EXPENSE', 'INCOME'] as const;

function isoOrThrow(value: string, field: string): ISODate {
  if (!isISODate(value)) throw new DataIntegrityError(`Date invalide pour ${field} : « ${value} »`);
  return value;
}

export function toRecurringRule(row: RecurringRow): RecurringRule {
  return {
    id: row.id,
    accountId: row.accountId,
    categoryId: row.categoryId,
    type: parseEnum(FLOW_TYPES, row.type, 'RecurringRule.type'),
    amount: row.amount,
    label: row.label,
    frequency: parseEnum(FREQUENCIES, row.frequency, 'RecurringRule.frequency'),
    startDate: isoOrThrow(row.startDate, 'RecurringRule.startDate'),
    nextDate: isoOrThrow(row.nextDate, 'RecurringRule.nextDate'),
    endDate: row.endDate === null ? null : isoOrThrow(row.endDate, 'RecurringRule.endDate'),
    active: row.active,
    autoCreate: row.autoCreate,
  };
}

export async function listRecurring(userId: string): Promise<RecurringRule[]> {
  const rows = await prisma.recurringRule.findMany({
    where: { userId },
    orderBy: [{ active: 'desc' }, { nextDate: 'asc' }, { label: 'asc' }],
  });
  return rows.map(toRecurringRule);
}

export async function findRecurring(userId: string, id: string, db: Db = prisma): Promise<RecurringRule | null> {
  const row = await db.recurringRule.findFirst({ where: { id, userId } });
  return row ? toRecurringRule(row) : null;
}

export interface RecurringData {
  accountId: string;
  categoryId: string | null;
  type: 'EXPENSE' | 'INCOME';
  amount: number;
  label: string;
  frequency: Frequency;
  startDate: ISODate;
  nextDate: ISODate;
  endDate: ISODate | null;
  active: boolean;
  autoCreate: boolean;
}

export async function createRecurring(userId: string, data: RecurringData): Promise<RecurringRule> {
  return toRecurringRule(await prisma.recurringRule.create({ data: { ...data, userId } }));
}

export async function updateRecurring(
  userId: string,
  id: string,
  data: Partial<RecurringData>,
): Promise<RecurringRule | null> {
  const { count } = await prisma.recurringRule.updateMany({ where: { id, userId }, data });
  return count === 0 ? null : findRecurring(userId, id);
}

export async function deleteRecurring(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.recurringRule.deleteMany({ where: { id, userId } });
  return count > 0;
}

/** Règles actives à création automatique dont l'échéance est passée. */
export async function listDueRules(userId: string, today: ISODate, db: Db = prisma): Promise<RecurringRule[]> {
  const rows = await db.recurringRule.findMany({
    where: { userId, active: true, autoCreate: true, nextDate: { lte: today } },
    orderBy: { nextDate: 'asc' },
  });
  return rows.map(toRecurringRule);
}

/**
 * Avance `nextDate` uniquement si elle vaut encore `expected` (verrou optimiste) :
 * garantit qu'une échéance n'est matérialisée qu'une fois, même en cas d'appels concurrents.
 */
export async function advanceNextDate(
  userId: string,
  id: string,
  expected: ISODate,
  next: ISODate,
  db: Db,
): Promise<boolean> {
  const { count } = await db.recurringRule.updateMany({
    where: { id, userId, nextDate: expected },
    data: { nextDate: next },
  });
  return count > 0;
}
