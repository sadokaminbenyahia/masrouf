'use client';
import { useId, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ChevronLeft, ChevronRight, Loader2, Upload } from 'lucide-react';
import { formatDateFR } from '@/domain/dates';
import type { Category, ImportPreviewRow } from '@/domain/types';
import { toastInfo, toastSuccess } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { AiBadge } from '@/components/shared/ai-badge';
import { Money } from '@/components/shared/money';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  PREVIEW_PAGE_SIZE,
  applyCategoryToSelection,
  cleanedLabel,
  editOf,
  effectiveLabel,
  filterRows,
  hasCleanableLabels,
  isSelectable,
  isSelected,
  pageCount,
  plural,
  previewCounts,
  setCategory,
  setSelected,
  type PreviewFilter,
  type RowEdits,
} from './import-logic';

const NO_CATEGORY = '__none__';

interface PreviewStepProps {
  rows: ImportPreviewRow[];
  edits: RowEdits;
  onEditsChange: (edits: RowEdits) => void;
  /** Envoyer les libellés nettoyés (proposés par le serveur) plutôt que les libellés bruts */
  cleanLabels: boolean;
  onCleanLabelsChange: (clean: boolean) => void;
  categories: Category[];
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onCommit: () => void;
}

function DuplicateBadge({ duplicate }: { duplicate: ImportPreviewRow['duplicate'] }) {
  if (duplicate === 'EXISTING') return <Badge variant="secondary">Déjà importée</Badge>;
  if (duplicate === 'IN_FILE') return <Badge variant="warning">Doublon dans le fichier</Badge>;
  if (duplicate === 'POSSIBLE')
    return (
      <Badge variant="warning" title="Même montant à 2 jours près, avec un libellé différent">
        Doublon possible
      </Badge>
    );
  return <span className="text-muted-foreground text-sm">Nouvelle</span>;
}

export function PreviewStep({
  rows,
  edits,
  onEditsChange,
  cleanLabels,
  onCleanLabelsChange,
  categories,
  pending,
  error,
  onBack,
  onCommit,
}: PreviewStepProps) {
  const [filter, setFilter] = useState<PreviewFilter>('ALL');
  const [page, setPage] = useState(1);
  const [bulkCategory, setBulkCategory] = useState<string>('');
  const bulkId = useId();
  const cleanId = useId();
  const cleanable = useMemo(() => hasCleanableLabels(rows), [rows]);

  const counts = useMemo(() => previewCounts(rows, edits), [rows, edits]);
  const filtered = useMemo(() => filterRows(rows, edits, filter), [rows, edits, filter]);
  const pages = pageCount(filtered.length);
  const currentPage = Math.min(page, pages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PREVIEW_PAGE_SIZE,
    currentPage * PREVIEW_PAGE_SIZE,
  );

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.kind === 'EXPENSE'),
    [categories],
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.kind === 'INCOME'),
    [categories],
  );

  const selectablePage = pageRows.filter(isSelectable);
  const selectedOnPage = selectablePage.filter((r) => isSelected(edits, r)).length;
  const headerChecked: boolean | 'indeterminate' =
    selectablePage.length > 0 && selectedOnPage === selectablePage.length
      ? true
      : selectedOnPage > 0
        ? 'indeterminate'
        : false;

  const applyBulk = () => {
    if (bulkCategory === '') return;
    const category =
      bulkCategory === NO_CATEGORY ? null : (categories.find((c) => c.id === bulkCategory) ?? null);
    const r = applyCategoryToSelection(edits, rows, category);
    onEditsChange(r.edits);
    if (r.applied > 0) toastSuccess(`Catégorie appliquée à ${plural(r.applied, 'ligne')}.`);
    if (r.skipped > 0) {
      toastInfo(
        `${plural(r.skipped, 'ligne ignorée', 'lignes ignorées')} : la catégorie ne correspond pas au type (dépense ou revenu).`,
      );
    }
    if (r.applied === 0 && r.skipped === 0) toastInfo('Aucune ligne sélectionnée.');
  };

  const importLabel = `Importer ${plural(counts.selected, 'transaction')}`;

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Lignes analysées', value: counts.total },
          { label: 'À importer', value: counts.selected, accent: 'text-primary' },
          { label: 'Déjà importées', value: counts.existing },
          {
            label: 'Doublons à vérifier',
            value: counts.inFile + counts.possible,
            accent: counts.inFile + counts.possible > 0 ? 'text-warning' : '',
          },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-xl border px-4 py-3">
            <dt className="text-muted-foreground text-xs">{s.label}</dt>
            <dd className={cn('text-xl font-semibold tabular-nums', s.accent)}>{s.value}</dd>
          </div>
        ))}
      </dl>

      {counts.existing + counts.inFile + counts.possible > 0 && (
        <p className="text-muted-foreground text-sm">
          {counts.existing > 0 &&
            'Les lignes « Déjà importées » existent dans vos transactions et ne seront pas ajoutées. '}
          {counts.inFile + counts.possible > 0 &&
            'Les doublons dans le fichier et les doublons possibles (même montant à 2 jours près, libellé différent) sont décochés : cochez-les s’il s’agit bien d’opérations distinctes.'}
        </p>
      )}

      {cleanable && (
        <div className="bg-card flex items-start gap-3 rounded-xl border px-4 py-3">
          <Switch
            id={cleanId}
            checked={cleanLabels}
            onCheckedChange={onCleanLabelsChange}
            aria-describedby={`${cleanId}-aide`}
            className="mt-0.5"
          />
          <div className="grid gap-0.5">
            <Label htmlFor={cleanId}>Nettoyer les libellés</Label>
            <p id={`${cleanId}-aide`} className="text-muted-foreground text-sm">
              Retire les préfixes bancaires et références (« CB », dates, numéros) pour des libellés
              lisibles. Le libellé d’origine reste affiché en dessous.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <ToggleGroup
          type="single"
          variant="outline"
          value={filter}
          onValueChange={(v) => {
            if (v === 'ALL' || v === 'TO_IMPORT' || v === 'DUPLICATES') {
              setFilter(v);
              setPage(1);
            }
          }}
          aria-label="Filtrer les lignes"
        >
          <ToggleGroupItem value="ALL">Toutes ({counts.total})</ToggleGroupItem>
          <ToggleGroupItem value="TO_IMPORT">À importer ({counts.selected})</ToggleGroupItem>
          <ToggleGroupItem value="DUPLICATES">
            Doublons ({counts.existing + counts.inFile + counts.possible})
          </ToggleGroupItem>
        </ToggleGroup>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-1.5 sm:w-64">
            <Label htmlFor={bulkId}>Appliquer une catégorie à la sélection</Label>
            <Select value={bulkCategory} onValueChange={setBulkCategory}>
              <SelectTrigger id={bulkId}>
                <SelectValue placeholder="Choisir une catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sans catégorie</SelectItem>
                {expenseCategories.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Dépenses</SelectLabel>
                    {expenseCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {incomeCategories.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Revenus</SelectLabel>
                    {incomeCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={applyBulk}
            disabled={bulkCategory === '' || counts.selected === 0}
          >
            Appliquer
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <Table aria-label="Aperçu de l’import" className="min-w-[760px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={headerChecked}
                  disabled={selectablePage.length === 0}
                  onCheckedChange={(v) => onEditsChange(setSelected(edits, pageRows, v === true))}
                  aria-label="Tout sélectionner sur cette page"
                />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center text-sm">
                  {filter === 'DUPLICATES' ? 'Aucun doublon détecté.' : 'Aucune ligne à afficher.'}
                </TableCell>
              </TableRow>
            )}
            {pageRows.map((row) => {
              const edit = editOf(edits, row);
              const selectable = isSelectable(row);
              const selected = isSelected(edits, row);
              const options = row.type === 'EXPENSE' ? expenseCategories : incomeCategories;
              const label = effectiveLabel(row, cleanLabels);
              const cleaned = cleanLabels && cleanedLabel(row) !== null;
              return (
                <TableRow
                  key={row.index}
                  data-state={selected ? 'selected' : undefined}
                  className={cn(!selected && 'text-muted-foreground')}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected}
                      disabled={!selectable}
                      onCheckedChange={(v) => onEditsChange(setSelected(edits, [row], v === true))}
                      aria-label={
                        selectable ? `Importer « ${label} »` : `« ${label} » est déjà importée`
                      }
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {formatDateFR(row.date, 'short')}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <p className="text-foreground truncate font-medium" title={label}>
                      {label}
                    </p>
                    {cleaned && (
                      <p className="text-muted-foreground truncate text-xs" title={row.label}>
                        <span className="sr-only">Libellé d’origine : </span>
                        {row.label}
                      </p>
                    )}
                    {row.note && (
                      <p className="text-muted-foreground truncate text-xs" title={row.note}>
                        {row.note}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money value={row.amount} type={row.type} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={edit.categoryId ?? ''}
                        disabled={!selectable}
                        onChange={(e) =>
                          onEditsChange(
                            setCategory(edits, row, e.target.value === '' ? null : e.target.value),
                          )
                        }
                        aria-label={`Catégorie pour « ${label} »`}
                        className="border-input bg-card text-foreground focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-9 max-w-48 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50 dark:[color-scheme:dark]"
                      >
                        <option value="">Sans catégorie</option>
                        {options.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {edit.categoryFromAI && edit.categoryId !== null && (
                        <AiBadge
                          label="Suggestion"
                          {...(row.suggestionConfidence !== null
                            ? { confidence: row.suggestionConfidence }
                            : {})}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <DuplicateBadge duplicate={row.duplicate} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {pages > 1 && (
        <nav
          aria-label="Pagination de l’aperçu"
          className="flex items-center justify-between gap-3"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Page précédente"
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            Page {currentPage} sur {pages} · lignes {(currentPage - 1) * PREVIEW_PAGE_SIZE + 1} à{' '}
            {Math.min(currentPage * PREVIEW_PAGE_SIZE, filtered.length)} sur {filtered.length}
          </p>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage >= pages}
            aria-label="Page suivante"
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </nav>
      )}

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>L’import a échoué</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          <ArrowLeft aria-hidden="true" />
          Retour
        </Button>
        <Button type="button" onClick={onCommit} disabled={counts.selected === 0 || pending}>
          {pending ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          ) : (
            <Upload aria-hidden="true" />
          )}
          {importLabel}
        </Button>
      </div>
    </div>
  );
}
