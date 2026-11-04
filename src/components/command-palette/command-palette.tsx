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
  type LucideIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { listTransactionsAction } from '@/app/actions/transactions';
import { formatRelativeDayFR, type ISODate } from '@/domain/dates';
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
const TX_LIMIT = 5;
const AMOUNT_RE = /(?<![\p{L}\d])\d+(?:[.,]\d{1,3})?(?![\p{L}\d])/u;

/** Mots-clés de recherche des pages (en plus du libellé). */
const NAV_KEYWORDS: Record<string, string[]> = {
  '/tableau-de-bord': ['accueil', 'dashboard', 'résumé', 'synthèse'],
  '/transactions': ['opérations', 'dépenses', 'revenus', 'historique'],
  '/comptes': ['banque', 'soldes', 'portefeuille', 'espèces'],
  '/budgets': ['plafonds', 'enveloppes', 'limites'],
  '/objectifs': ['épargne', 'projets', 'économies'],
  '/recurrents': ['abonnements', 'échéances', 'prélèvements'],
  '/import': ['csv', 'relevé', 'importer'],
  '/analyses': ['statistiques', 'graphiques', 'tendances', 'rapports'],
  '/assistant': ['questions', 'aide', 'ia', 'intelligence'],
  '/parametres': ['réglages', 'préférences', 'profil', 'catégories', 'export'],
};

function words(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * Pertinence d'une page ou d'une action pour la saisie (0 = exclue). Filtre volontairement strict
 * (le filtre flou de cmdk trouvait « caf » dans « Nouveau budget plafond ») : chaque mot saisi doit
 * COMMENCER un mot du libellé ou des mots-clés. Un début de libellé vaut 1, un mot intérieur du
 * libellé 0,8, un mot-clé 0,5 ; la note est la moyenne sur les mots saisis.
 */
export function paletteScore(search: string, label: string, keywords: readonly string[]): number {
  const terms = words(search);
  if (terms.length === 0) return 1;
  const labelWords = words(label);
  const keywordWords = words(keywords.join(' '));
  let total = 0;
  for (const term of terms) {
    let best = 0;
    labelWords.forEach((w, i) => {
      if (w.startsWith(term)) best = Math.max(best, i === 0 ? 1 : 0.8);
    });
    if (best === 0 && keywordWords.some((w) => w.startsWith(term))) best = 0.5;
    if (best === 0) return 0;
    total += best;
  }
  return total / terms.length;
}

interface Entry {
  id: string;
  label: string;
  keywords: readonly string[];
  icon: LucideIcon;
  shortcut?: ReactNode;
  onSelect: () => void;
}

/** Garde les entrées pertinentes, triées par pertinence décroissante (tri stable). */
function rank(entries: readonly Entry[], search: string): Entry[] {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: paletteScore(search, entry.label, entry.keywords),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.entry);
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/**
 * Palette de commandes globale (Ctrl/⌘ + K) : navigation, actions, IA et recherche.
 *
 * Le filtrage et l'ordre sont calculés ici (`shouldFilter={false}`) : cmdk sélectionne alors la
 * première option rendue, c'est-à-dire la meilleure page ou action. Les propositions de
 * l'assistant (« Ajouter « … » », « Demander à l'assistant ») viennent après, puis les
 * transactions trouvées par le serveur.
 */
export function CommandPalette({ today }: { today: ISODate }) {
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
      unwrap(await listTransactionsAction({ search: debounced, pageSize: TX_LIMIT, page: 1 })),
    enabled: searchEnabled,
    staleTime: 30_000,
  });
  const results = searchEnabled ? (txQuery.data?.items ?? []).slice(0, TX_LIMIT) : [];
  const searching = searchEnabled && txQuery.isFetching;
  const looksLikeEntry = AMOUNT_RE.test(text);
  const showAsk = text.length >= 3;

  const navEntries: Entry[] = NAV_ITEMS.map((item) => ({
    id: `nav:${item.href}`,
    label: item.label,
    keywords: NAV_KEYWORDS[item.href] ?? [],
    icon: item.icon,
    shortcut: (
      <CommandShortcut aria-label={`Raccourci : G puis ${item.shortcut.toUpperCase()}`}>
        G {item.shortcut.toUpperCase()}
      </CommandShortcut>
    ),
    onSelect: () => router.push(item.href),
  }));

  const discreetLabel = discreet ? 'Afficher les montants' : 'Masquer les montants';
  const actionEntries: Entry[] = [
    {
      id: 'action:ajouter',
      label: 'Ajouter une transaction',
      keywords: ['nouvelle', 'dépense', 'revenu', 'saisir', 'saisie'],
      icon: PlusIcon,
      shortcut: <CommandShortcut aria-label="Raccourci : N">N</CommandShortcut>,
      onSelect: () => openQuickAdd(),
    },
    {
      id: 'action:importer',
      label: 'Importer un relevé',
      keywords: ['csv', 'banque', 'fichier'],
      icon: UploadIcon,
      onSelect: () => router.push('/import'),
    },
    {
      id: 'action:budget',
      label: 'Nouveau budget',
      keywords: ['créer', 'plafond', 'enveloppe'],
      icon: PiggyBankIcon,
      onSelect: () => router.push('/budgets'),
    },
    {
      id: 'action:objectif',
      label: 'Nouvel objectif',
      keywords: ['créer', 'épargne', 'projet'],
      icon: TargetIcon,
      onSelect: () => router.push('/objectifs'),
    },
    {
      id: 'action:theme',
      label: 'Changer de thème',
      keywords: ['sombre', 'clair', 'dark', 'light', 'apparence'],
      icon: SunMoonIcon,
      onSelect: () => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'),
    },
    {
      id: 'action:discret',
      label: discreetLabel,
      keywords: ['discret', 'confidentialité', 'cacher', 'montrer'],
      icon: discreet ? EyeIcon : EyeOffIcon,
      onSelect: toggleDiscreet,
    },
    {
      id: 'action:raccourcis',
      label: 'Aide des raccourcis',
      keywords: ['clavier', 'touches'],
      icon: KeyboardIcon,
      shortcut: <CommandShortcut aria-label="Raccourci : point d’interrogation">?</CommandShortcut>,
      onSelect: () => openShortcutsHelp(),
    },
  ];

  const nav = rank(navEntries, text);
  const actions = rank(actionEntries, text);

  const renderEntry = (entry: Entry) => (
    <CommandItem key={entry.id} value={entry.id} onSelect={() => run(entry.onSelect)}>
      <entry.icon aria-hidden="true" />
      <span>{entry.label}</span>
      {entry.shortcut}
    </CommandItem>
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Palette de commandes"
      description="Recherchez une page, une action ou une transaction. Utilisez les flèches puis Entrée."
      commandProps={{ shouldFilter: false }}
    >
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder="Rechercher une page, une action…"
        aria-label="Rechercher une page, une action…"
      />
      <CommandList>
        <CommandEmpty>Aucun résultat.</CommandEmpty>

        {nav.length > 0 ? (
          <CommandGroup heading="Navigation">{nav.map(renderEntry)}</CommandGroup>
        ) : null}

        {actions.length > 0 ? (
          <>
            {nav.length > 0 ? <CommandSeparator alwaysRender /> : null}
            <CommandGroup heading="Actions">{actions.map(renderEntry)}</CommandGroup>
          </>
        ) : null}

        {looksLikeEntry || showAsk ? (
          <>
            {nav.length + actions.length > 0 ? <CommandSeparator alwaysRender /> : null}
            <CommandGroup heading="Intelligence">
              {looksLikeEntry ? (
                <CommandItem value="ia:ajouter" onSelect={() => run(() => openQuickAdd({ text }))}>
                  <WandSparklesIcon aria-hidden="true" />
                  <span className="truncate">Ajouter « {text} »</span>
                </CommandItem>
              ) : null}
              {showAsk ? (
                <CommandItem
                  value="ia:demander"
                  onSelect={() =>
                    run(() => router.push(`/assistant?q=${encodeURIComponent(text.slice(0, 300))}`))
                  }
                >
                  <MessageCircleQuestionIcon aria-hidden="true" />
                  <span className="truncate">Demander à l’assistant : {text}</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          </>
        ) : null}

        {searchEnabled ? (
          <>
            <CommandSeparator alwaysRender />
            <CommandGroup heading="Transactions">
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
                  value={`tx:${t.id}`}
                  onSelect={() =>
                    run(() => router.push(`/transactions?q=${encodeURIComponent(debounced)}`))
                  }
                >
                  <ReceiptTextIcon aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t.label}</span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatRelativeDayFR(t.date, today)}
                  </span>
                  <Money value={t.amount} type={t.type} className="shrink-0 text-sm" />
                </CommandItem>
              ))}
              {results.length > 0 ? (
                <CommandItem
                  value="tx:all"
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
