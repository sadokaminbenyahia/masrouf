import { formatMoney, maskMoneyInText, type Millimes } from '@/domain/money';

/** « 1 transaction », « 3 transactions ». */
export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n > 1 ? plural : singular}`;
}

/**
 * Message de toast explicite : « Café · 3,500 DT ajouté ». En mode discret, le montant est
 * masqué (« Café · ••• DT ajouté ») via `maskMoneyInText`.
 */
export function describeTransaction(
  t: { label: string; amount: Millimes },
  verb: string,
  discreet: boolean,
): string {
  const label = t.label.trim() || 'Transaction';
  const message = `${label} · ${formatMoney(t.amount)} ${verb}`;
  return discreet ? maskMoneyInText(message) : message;
}
