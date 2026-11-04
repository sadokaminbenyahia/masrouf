import { DEFAULT_TIMEZONE, todayInTimeZone, type ISODate } from '@/domain/dates';

export const APP_TIMEZONE = process.env.APP_TIMEZONE ?? DEFAULT_TIMEZONE;

/** « Aujourd'hui » dans le fuseau de l'application (Africa/Tunis par défaut). */
export function today(): ISODate {
  return todayInTimeZone(APP_TIMEZONE);
}
