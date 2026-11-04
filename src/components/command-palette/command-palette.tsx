'use client';
import { useQuery } from '@tanstack/react-query';
import {
  EyeIcon,
  EyeOffIcon,
  KeyboardIcon,
  Loader2Icon,
  MessageCircleQuestionIcon,
  PiggyBankIcon,
  PlusIcon,
  ReceiptTextIcon,
  SunMoonIcon,
  TargetIcon,
  UploadIcon,
  WandSparklesIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { listTransactionsAction } from '@/app/actions/transactions';
import { formatDateFR } from '@/domain/dates';
import { NAV_ITEMS } from '@/components/layout/nav-items';
import { Money } from '@/components/shared/money';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { COMMAND_PALETTE_EVENT, onUiEvent, openQuickAdd, openShortcutsHelp } from '@/lib/events';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { useHotkey } from '@/lib/hooks/use-hotkey';
import { queryKeys, unwrap } from '@/lib/query';

const SEARCH_DEBOUNCE_MS = 250;
const AMOUNT_RE = /(?<![\p{L}\d])\d+(?:[.,]\d{1,3})?(?![\p{L}\d])/u;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Palette de commandes globale (Ctrl/⌘ + K) : navigation, actions, IA et recherche. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const { discreet, toggle: toggleDiscreet } = useDiscreetMode();

  useHotkey(
    'mod+k',
    (e) => {
      e.preventDefault();
      setOpen((o) => !o);
    },
    { allowInInputs: true },
  );

  useEffect(() => onUiEvent(COMMAND_PALETTE_EVENT, () => setOpen(true)), []);

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSearch('');
  }, []);

  const run = useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange],
  );

  const text = search.trim();
  const debounced = useDebounced(text, SEARCH_DEBOUNCE_MS);
  const searchEnabled = open && debounced.length >= 2;
  const txQuery = useQuery({
    queryKey: queryKeys.transactions({ palette: true, search: debounced }),
    queryFn: async () =>
      unwrap(await listTransactionsAction({ search: debounced, pageSize: 5, page: 1 })),
    enabled: searchEnabled,
    staleTime: 30_000,
  });
  const results = searchEnabled ? (txQuery.data?.items ?? []) : [];
  const searching = searchEnabled && txQuery.isFetching;
  const looksLikeEntry = AMOUNT_RE.test(text);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Palette de commandes"
      description="Recherchez une page, une action ou une transaction. Utilisez les flèches puis Entrée."
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Rechercher une page, une action…"
        aria-label="Rechercher une page, une action…"
      />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        {text.length >= 3 || looksLikeEntry ? (
          <CommandGroup heading="Intelligence" forceMount>
            {looksLikeEntry ? (
              <CommandItem
                forceMount
                value={`ia-ajouter ${text}`}
                onSelect={() => run(() => openQuickAdd({ text }))}
              >
                <WandSparklesIcon aria-hidden="true" />
                <span className="truncate">Ajouter « {text} »</span>
              </CommandItem>
            ) : null}
            {text.length >= 3 ? (
              <CommandItem
                forceMount
                value={`ia-demander ${text}`}
                onSelect={() =>
                  run(() => router.push(`/assistant?q=${encodeURIComponent(text.slice(0, 300))}`))
                }
              >
                <MessageCircleQuestionIcon aria-hidden="true" />
                <span className="truncate">Demander à l’assistant : {text}</span>
              </CommandItem>
            ) : null}
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Navigation">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              value={`nav ${item.label}`}
              keywords={[item.href.slice(1), 'aller', 'page']}
              onSelect={() => run(() => router.push(item.href))}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
              <CommandShortcut aria-label={`Raccourci : G puis ${item.shortcut.toUpperCase()}`}>
                G {item.shortcut.toUpperCase()}
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="action Ajouter une transaction"
            keywords={['nouvelle', 'dépense', 'revenu', 'saisir']}
            onSelect={() => run(() => openQuickAdd())}
          >
            <PlusIcon aria-hidden="true" />
            <span>Ajouter une transaction</span>
            <CommandShortcut aria-label="Raccourci : N">N</CommandShortcut>
          </CommandItem>
          <CommandItem
            value="action Importer un relevé"
            keywords={['csv', 'banque', 'import']}
            onSelect={() => run(() => router.push('/import'))}
          >
            <UploadIcon aria-hidden="true" />
            <span>Importer un relevé</span>
          </CommandItem>
          <CommandItem
            value="action Nouveau budget"
            keywords={['budget', 'plafond']}
            onSelect={() => run(() => router.push('/budgets'))}
          >
            <PiggyBankIcon aria-hidden="true" />
            <span>Nouveau budget</span>
          </CommandItem>
          <CommandItem
            value="action Nouvel objectif"
            keywords={['objectif', 'épargne']}
            onSelect={() => run(() => router.push('/objectifs'))}
          >
            <TargetIcon aria-hidden="true" />
            <span>Nouvel objectif</span>
          </CommandItem>
          <CommandItem
            value="action Changer de thème"
            keywords={['sombre', 'clair', 'dark', 'thème']}
            onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))}
          >
            <SunMoonIcon aria-hidden="true" />
            <span>Changer de thème</span>
          </CommandItem>
          <CommandItem
            value={`action ${discreet ? 'Afficher les montants' : 'Masquer les montants'}`}
            keywords={['discret', 'confidentialité', 'cacher']}
            onSelect={() => run(toggleDiscreet)}
          >
            {discreet ? <EyeIcon aria-hidden="true" /> : <EyeOffIcon aria-hidden="true" />}
            <span>{discreet ? 'Afficher les montants' : 'Masquer les montants'}</span>
          </CommandItem>
          <CommandItem
            value="action Aide des raccourcis"
            keywords={['clavier', 'aide', 'raccourcis']}
            onSelect={() => run(() => openShortcutsHelp())}
          >
            <KeyboardIcon aria-hidden="true" />
            <span>Aide des raccourcis</span>
            <CommandShortcut aria-label="Raccourci : point d’interrogation">?</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        {searchEnabled ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Transactions" forceMount>
              {searching && results.length === 0 ? (
                <div
                  role="status"
                  className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm"
                >
                  <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                  Recherche…
                </div>
              ) : null}
              {txQuery.isError ? (
                <p role="alert" className="text-destructive px-2 py-3 text-sm">
                  La recherche de transactions a échoué.
                </p>
              ) : null}
              {!searching && !txQuery.isError && results.length === 0 ? (
                <p className="text-muted-foreground px-2 py-3 text-sm">
                  Aucune transaction ne correspond.
                </p>
              ) : null}
              {results.map((t) => (
                <CommandItem
                  key={t.id}
                  forceMount
                  value={`tx ${t.id} ${t.label}`}
                  onSelect={() =>
                    run(() => router.push(`/transactions?q=${encodeURIComponent(debounced)}`))
                  }
                >
                  <ReceiptTextIcon aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatDateFR(t.date, 'short')}
                  </span>
                  <Money value={t.amount} type={t.type} className="shrink-0 text-sm" />
                </CommandItem>
              ))}
              {results.length > 0 ? (
                <CommandItem
                  forceMount
                  value={`tx-all ${debounced}`}
                  onSelect={() =>
                    run(() => router.push(`/transactions?q=${encodeURIComponent(debounced)}`))
                  }
                >
                  <ReceiptTextIcon aria-hidden="true" />
                  <span>Voir toutes les transactions « {debounced} »</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          </>
        ) : null}
      </CommandList>
    </CommandDialog>
  );
}
