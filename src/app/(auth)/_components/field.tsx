import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export const EMAIL_REQUIRED = 'L’adresse e-mail est requise.';

/**
 * Messages d'erreur du champ e-mail : un champ laissé vide reçoit « L'adresse e-mail est
 * requise. » plutôt que « Adresse e-mail invalide. » (message générique du schéma partagé).
 */
export function emailErrors(messages: string[] | undefined, value: string | undefined) {
  if (!messages || messages.length === 0) return messages;
  return (value ?? '').trim() === '' ? [EMAIL_REQUIRED] : messages;
}

export function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} className="text-expense text-xs">
      {messages.join(' ')}
    </p>
  );
}

export function Field({
  id,
  label,
  hint,
  aside,
  children,
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {aside}
      </div>
      {children}
      {hint}
    </div>
  );
}
