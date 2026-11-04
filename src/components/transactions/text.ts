/** « 1 transaction », « 3 transactions ». */
export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n > 1 ? plural : singular}`;
}
