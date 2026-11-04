'use client';
import { X } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

export const MAX_TAGS = 10;
const MAX_TAG_LENGTH = 30;

/** Normalise une saisie de tag ; renvoie un message d'erreur si elle est invalide. */
export function normalizeTag(raw: string): { tag: string } | { error: string } {
  const tag = raw.trim().replace(/\s+/g, ' ');
  if (tag === '') return { error: 'Tag vide.' };
  if (/[,;]/.test(tag)) return { error: 'Un tag ne peut pas contenir « , » ni « ; ».' };
  if (tag.length > MAX_TAG_LENGTH) return { error: `${MAX_TAG_LENGTH} caractères maximum.` };
  return { tag };
}

interface TagInputProps {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Saisie de tags : virgule ou Entrée pour ajouter, Retour arrière pour retirer le dernier. */
export function TagInput({
  id,
  value,
  onChange,
  suggestions = [],
  'aria-invalid': ariaInvalid,
  'aria-describedby': describedBy,
}: TagInputProps) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const errorId = useId();

  function commit(raw: string): boolean {
    if (raw.trim() === '') return true;
    const parts = raw.split(/[,;]/);
    let next = value;
    for (const part of parts) {
      if (part.trim() === '') continue;
      const r = normalizeTag(part);
      if ('error' in r) {
        setError(r.error);
        return false;
      }
      if (next.some((t) => t.toLowerCase() === r.tag.toLowerCase())) continue;
      if (next.length >= MAX_TAGS) {
        setError(`${MAX_TAGS} tags maximum.`);
        return false;
      }
      next = [...next, r.tag];
    }
    setError(null);
    if (next !== value) onChange(next);
    setDraft('');
    return true;
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      if (e.ctrlKey || e.metaKey) return; // Ctrl+Entrée : envoi du formulaire
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const available = suggestions.filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()));
  const describedByIds = [describedBy, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <div
        className={cn(
          'border-input dark:bg-input/30 flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border bg-transparent px-2 py-1.5 shadow-xs',
          'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
          (ariaInvalid || error) && 'border-destructive',
        )}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="hover:bg-background/60 focus-visible:ring-ring inline-flex size-6 items-center justify-center rounded-sm focus-visible:ring-2 focus-visible:outline-none"
              aria-label={`Retirer le tag ${tag}`}
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => commit(draft)}
          list={available.length > 0 ? listId : undefined}
          placeholder={value.length === 0 ? 'vacances, travail…' : undefined}
          aria-invalid={ariaInvalid || !!error || undefined}
          aria-describedby={describedByIds}
          autoComplete="off"
          className="placeholder:text-muted-foreground min-w-24 flex-1 bg-transparent py-1 text-base outline-none md:text-sm"
        />
        {available.length > 0 && (
          <datalist id={listId}>
            {available.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-destructive mt-1 text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
