'use client';
import { ChevronDown, Search } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
}

interface MultiSelectFilterProps {
  label: string;
  searchLabel: string;
  options: MultiSelectOption[];
  selected: readonly string[];
  onChange: (values: string[]) => void;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Filtre multi-sélection : popover avec recherche et cases à cocher. */
export function MultiSelectFilter({
  label,
  searchLabel,
  options,
  selected,
  onChange,
}: MultiSelectFilterProps) {
  const [search, setSearch] = useState('');
  const listId = useId();
  const needle = normalize(search.trim());
  const visible = needle
    ? options.filter((o) => normalize(`${o.label} ${o.hint ?? ''}`).includes(needle))
    : options;
  const count = selected.length;

  function toggle(value: string) {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  }

  return (
    <Popover onOpenChange={(open) => !open && setSearch('')}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('min-h-11 md:min-h-10', count > 0 && 'border-primary text-primary')}
          aria-label={count > 0 ? `${label} (${count} sélectionné${count > 1 ? 's' : ''})` : label}
        >
          {label}
          {count > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums">
              {count}
            </span>
          )}
          <ChevronDown className="opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-border relative border-b p-2">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={searchLabel}
            aria-controls={listId}
            placeholder={searchLabel}
            className="h-9 pl-8"
          />
        </div>
        <ul id={listId} aria-label={label} className="max-h-72 overflow-y-auto p-1">
          {visible.length === 0 && (
            <li className="text-muted-foreground px-3 py-4 text-center text-sm">Aucun résultat</li>
          )}
          {visible.map((o) => {
            const id = `${listId}-${o.value}`;
            return (
              <li key={o.value}>
                <label
                  htmlFor={id}
                  className="hover:bg-accent flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm"
                >
                  <Checkbox
                    id={id}
                    checked={selected.includes(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                  />
                  {o.icon}
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-muted-foreground text-xs">{o.hint}</span>}
                </label>
              </li>
            );
          })}
        </ul>
        {count > 0 && (
          <div className="border-border border-t p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange([])}
            >
              Effacer la sélection
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
