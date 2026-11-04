'use client';
/**
 * Barre de filtres de /transactions. L'état fait foi dans l'URL : chaque changement produit
 * une nouvelle TransactionQuery transmise à `onChange`.
 */
import { CalendarDays, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useEffectEvent, useId, useState, type FormEvent } from 'react';
import { AmountInput } from '@/components/shared/amount-input';
import { CategoryIcon } from '@/components/shared/category-icon';
import { PeriodPicker } from '@/components/shared/period-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { ISODate } from '@/domain/dates';
import { resolvePeriod, type Period } from '@/domain/periods';
import type { AccountWithBalance, Category, Tag, TransactionType } from '@/domain/types';
import type { TransactionQueryData } from '@/lib/schemas/transactions';
import { cn } from '@/lib/utils';
import { MultiSelectFilter } from './multi-select-filter';
import { readAmountField } from './read-amount';
import {
  TYPE_LABELS,
  clearFilters,
  describeActiveFilters,
  describePeriod,
  detectPreset,
  withFilters,
} from './query-params';

const SEARCH_DEBOUNCE_MS = 300;

interface TransactionFiltersProps {
  query: TransactionQueryData;
  today: ISODate;
  accounts: AccountWithBalance[];
  categories: Category[];
  tags: Tag[];
  onChange: (next: TransactionQueryData) => void;
}

const chipClass = (active: boolean) =>
  cn(
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors md:min-h-9',
    'focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card hover:bg-accent text-foreground',
  );

export function TransactionFilters({
  query,
  today,
  accounts,
  categories,
  tags,
  onChange,
}: TransactionFiltersProps) {
  // ── Recherche (debounce 300 ms, resynchronisée si l'URL change ailleurs) ──
  const external = query.search ?? '';
  const [searchText, setSearchText] = useState(external);
  const [syncedSearch, setSyncedSearch] = useState(external);
  if (external !== syncedSearch) {
    setSyncedSearch(external);
    if (searchText.trim() !== external) setSearchText(external);
  }
  const pushSearch = useEffectEvent((value: string) =>
    onChange(withFilters(query, { search: value || undefined })),
  );
  useEffect(() => {
    const value = searchText.trim();
    if (value === external) return;
    const timer = window.setTimeout(() => pushSearch(value), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchText, external]);

  const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const chips = describeActiveFilters(query, { accountNames, categoryNames, today });

  const activeType = query.types?.length === 1 ? query.types[0] : undefined;
  const typeChoices: { value: TransactionType | null; label: string }[] = [
    { value: null, label: 'Tout' },
    { value: 'EXPENSE', label: TYPE_LABELS.EXPENSE },
    { value: 'INCOME', label: TYPE_LABELS.INCOME },
    { value: 'TRANSFER', label: TYPE_LABELS.TRANSFER },
  ];

  const sortedCategories = [...categories].sort(
    (a, b) => (a.kind === b.kind ? a.sortOrder - b.sortOrder : a.kind === 'EXPENSE' ? -1 : 1),
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:max-w-sm lg:flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pushSearch(searchText.trim());
            }}
            aria-label="Rechercher une transaction"
            placeholder="Rechercher une transaction"
            maxLength={100}
            className="min-h-11 pl-9 md:min-h-10"
          />
        </div>
        <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-1.5">
          {typeChoices.map((c) => {
            const pressed = c.value === null ? !query.types?.length : activeType === c.value;
            return (
              <button
                key={c.label}
                type="button"
                aria-pressed={pressed}
                className={chipClass(pressed)}
                onClick={() =>
                  onChange(withFilters(query, { types: c.value ? [c.value] : undefined }))
                }
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelectFilter
          label="Comptes"
          searchLabel="Rechercher un compte"
          options={accounts.map((a) => ({
            value: a.id,
            label: a.name,
            ...(a.archived ? { hint: 'archivé' } : {}),
          }))}
          selected={query.accountIds ?? []}
          onChange={(ids) => onChange(withFilters(query, { accountIds: ids }))}
        />
        <MultiSelectFilter
          label="Catégories"
          searchLabel="Rechercher une catégorie"
          options={sortedCategories.map((c) => ({
            value: c.id,
            label: c.name,
            hint: c.kind === 'EXPENSE' ? 'Dépense' : 'Revenu',
            icon: <CategoryIcon icon={c.icon} color={c.color} size="sm" />,
          }))}
          selected={query.categoryIds ?? []}
          onChange={(ids) => onChange(withFilters(query, { categoryIds: ids }))}
        />
        <button
          type="button"
          aria-pressed={!!query.uncategorized}
          className={chipClass(!!query.uncategorized)}
          onClick={() =>
            onChange(withFilters(query, { uncategorized: query.uncategorized ? undefined : true }))
          }
        >
          Sans catégorie
        </button>
        <PeriodFilter query={query} today={today} onChange={onChange} />
        <MoreFilters query={query} tags={tags} onChange={onChange} />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtres actifs" role="group">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="bg-secondary text-secondary-foreground inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pr-0.5 pl-3 text-xs font-medium"
            >
              <span className="truncate">{chip.label}</span>
              <button
                type="button"
                onClick={() => onChange(chip.next)}
                aria-label={`Retirer le filtre ${chip.label}`}
                className="hover:bg-background/70 focus-visible:ring-ring inline-flex size-7 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          ))}
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => {
              setSearchText('');
              onChange(clearFilters(query));
            }}
          >
            Tout effacer
          </Button>
        </div>
      )}
    </div>
  );
}

function PeriodFilter({
  query,
  today,
  onChange,
}: {
  query: TransactionQueryData;
  today: ISODate;
  onChange: (next: TransactionQueryData) => void;
}) {
  const label = describePeriod(query.from, query.to, today);
  const value: Period =
    query.from && query.to
      ? { preset: detectPreset({ from: query.from, to: query.to }, today), range: { from: query.from, to: query.to } }
      : { preset: 'THIS_MONTH', range: resolvePeriod('THIS_MONTH', today) };
  const active = label !== null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('min-h-11 md:min-h-10', active && 'border-primary text-primary')}
          aria-label={active ? `Période : ${label}` : 'Période : toutes les dates'}
        >
          <CalendarDays aria-hidden />
          <span className="max-w-48 truncate">{label ?? 'Période'}</span>
          <ChevronDown className="opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))]">
        <div className="grid gap-3">
          <p className="text-sm font-medium">Période</p>
          <PeriodPicker
            today={today}
            value={value}
            onChange={(p) => onChange(withFilters(query, { from: p.range.from, to: p.range.to }))}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-self-start"
            disabled={!active}
            onClick={() => onChange(withFilters(query, { from: undefined, to: undefined }))}
          >
            Toutes les dates
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MoreFilters({
  query,
  tags,
  onChange,
}: {
  query: TransactionQueryData;
  tags: Tag[];
  onChange: (next: TransactionQueryData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState('');
  const [min, setMin] = useState<number | null>(null);
  const [max, setMax] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const ids = { tag: `${uid}-tag`, min: `${uid}-min`, max: `${uid}-max`, list: `${uid}-tags` };
  const count =
    (query.tag ? 1 : 0) +
    (query.minAmount !== undefined ? 1 : 0) +
    (query.maxAmount !== undefined ? 1 : 0);

  function onOpenChange(next: boolean) {
    if (next) {
      setTag(query.tag ?? '');
      setMin(query.minAmount ?? null);
      setMax(query.maxAmount ?? null);
      setError(null);
    }
    setOpen(next);
  }

  function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const minRead = readAmountField(ids.min, min);
    const maxRead = readAmountField(ids.max, max);
    if (minRead.error || maxRead.error) {
      setError(minRead.error ?? maxRead.error ?? null);
      return;
    }
    const minValue = minRead.value;
    const maxValue = maxRead.value;
    if (minValue !== null && maxValue !== null && minValue > maxValue) {
      setError('Le minimum doit être inférieur ou égal au maximum.');
      return;
    }
    const t = tag.trim();
    if (t.length > 30) {
      setError('Le tag fait au plus 30 caractères.');
      return;
    }
    onChange(
      withFilters(query, {
        tag: t || undefined,
        minAmount: minValue ?? undefined,
        maxAmount: maxValue ?? undefined,
      }),
    );
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn('min-h-11 md:min-h-10', count > 0 && 'border-primary text-primary')}
        >
          <SlidersHorizontal aria-hidden />
          Plus de filtres
          {count > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs tabular-nums">
              {count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))]">
        <form onSubmit={apply} className="grid gap-3" noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.tag}>Tag</Label>
            <Input
              id={ids.tag}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              list={tags.length > 0 ? ids.list : undefined}
              autoComplete="off"
              maxLength={30}
            />
            {tags.length > 0 && (
              <datalist id={ids.list}>
                {tags.map((t) => (
                  <option key={t.id} value={t.name} />
                ))}
              </datalist>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.min}>Montant minimum</Label>
              <AmountInput id={ids.min} value={min} onChange={setMin} placeholder="0" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.max}>Montant maximum</Label>
              <AmountInput id={ids.max} value={max} onChange={setMax} placeholder="∞" />
            </div>
          </div>
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTag('');
                setMin(null);
                setMax(null);
                setError(null);
              }}
            >
              Réinitialiser
            </Button>
            <Button type="submit">Appliquer</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
