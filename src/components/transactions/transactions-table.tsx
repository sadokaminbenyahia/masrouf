'use client';
/**
 * Tableau des transactions (≥ lg) : TanStack Table en mode manuel (tri et pagination côté
 * serveur), groupement par jour, sélection multiple, navigation clavier et édition inline.
 */
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  type Row,
} from '@tanstack/react-table';
import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowUpDown, Repeat } from 'lucide-react';
import {
  Fragment,
  useId,
  useMemo,
  useReducer,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { AiBadge } from '@/components/shared/ai-badge';
import { CategoryBadge } from '@/components/shared/category-icon';
import { Money } from '@/components/shared/money';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatRelativeDayFR, type ISODate } from '@/domain/dates';
import type { AccountWithBalance, Category, Transaction } from '@/domain/types';
import { useHotkey } from '@/lib/hooks/use-hotkey';
import type { TransactionPatch } from '@/lib/schemas/transactions';
import type { TransactionQueryData } from '@/lib/schemas/transactions';
import { cn } from '@/lib/utils';
import { CellEditor, type CommitMove } from './cell-editor';
import { groupByDay } from './grouping';
import {
  initialTableEditState,
  isCellEditable,
  resolveActive,
  resolveEditing,
  tableEditReducer,
  type CellRef,
  type EditableColumn,
  type TableEditAction,
} from './inline-edit';
import { nextSort, type SortField } from './query-params';
import { RowActions, type RowActionHandlers } from './row-actions';
import { headerCheckState, type Selection } from './selection';

export interface TransactionsTableProps {
  items: Transaction[];
  today: ISODate;
  sort: TransactionQueryData['sort'];
  onSortChange: (sort: TransactionQueryData['sort']) => void;
  selection: Selection;
  onToggleRow: (id: string, shift: boolean) => void;
  onToggleAll: () => void;
  accounts: AccountWithBalance[];
  accountsById: ReadonlyMap<string, AccountWithBalance>;
  categories: Category[];
  categoriesById: ReadonlyMap<string, Category>;
  handlers: RowActionHandlers;
  onUpdate: (t: Transaction, patch: TransactionPatch) => void;
  busy: boolean;
}

const column = createColumnHelper<Transaction>();
const COLUMNS = [
  column.display({ id: 'select', enableSorting: false }),
  column.display({ id: 'date', enableSorting: true }),
  column.display({ id: 'label', enableSorting: true }),
  column.display({ id: 'category', enableSorting: false }),
  column.display({ id: 'account', enableSorting: false }),
  column.display({ id: 'amount', enableSorting: true }),
  column.display({ id: 'actions', enableSorting: false }),
];
const COLUMN_COUNT = COLUMNS.length;

const HEADER_LABELS: Record<string, string> = {
  date: 'Date',
  label: 'Libellé',
  category: 'Catégorie',
  account: 'Compte',
  amount: 'Montant',
};

function isSortField(id: string): id is SortField {
  return id === 'date' || id === 'label' || id === 'amount';
}

function isEditableColumnName(v: string | undefined): v is EditableColumn {
  return v === 'date' || v === 'label' || v === 'category' || v === 'account' || v === 'amount';
}

export function TransactionsTable({
  items,
  today,
  sort,
  onSortChange,
  selection,
  onToggleRow,
  onToggleAll,
  accounts,
  accountsById,
  categories,
  categoriesById,
  handlers,
  onUpdate,
  busy,
}: TransactionsTableProps) {
  const hintId = useId();
  const tableRef = useRef<HTMLTableElement>(null);
  const [state, dispatch] = useReducer(tableEditReducer, initialTableEditState);

  const rowIds = useMemo(() => items.map((t) => t.id), [items]);
  const byId = useMemo(() => new Map(items.map((t) => [t.id, t])), [items]);
  const active = resolveActive(state, rowIds);
  const editing = resolveEditing(state, rowIds);
  const isEditable = (rowId: string, col: EditableColumn) => isCellEditable(byId.get(rowId), col);

  // TanStack Table ne gère ici que le modèle de lignes, le tri (manuel) et la sélection.
  // eslint-disable-next-line react-hooks/incompatible-library -- pas de React Compiler dans ce projet
  const table = useReactTable({
    data: items,
    columns: COLUMNS,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (t) => t.id,
    manualSorting: true,
    manualPagination: true,
    enableRowSelection: true,
    state: {
      sorting: [{ id: sort.field, desc: sort.direction === 'desc' }],
      rowSelection: { ...selection },
    },
  });
  const rowsById = new Map(table.getRowModel().rows.map((r) => [r.id, r]));
  const groups =
    sort.field === 'date'
      ? groupByDay(items)
      : [{ date: null, items, income: 0, expense: 0, net: 0 }];

  function focusCell(cell: CellRef | null) {
    if (!cell) return;
    tableRef.current
      ?.querySelector<HTMLElement>(`[data-row-id="${cell.rowId}"][data-column="${cell.column}"]`)
      ?.focus();
  }

  /** Applique une action et renvoie le nouvel état (pour déplacer le focus aussitôt). */
  function run(action: TableEditAction) {
    const next = tableEditReducer(state, action);
    dispatch(action);
    return next;
  }

  function startEdit(cell: CellRef) {
    run({ type: 'startEdit', cell, rowIds, isEditable });
  }

  function handleCommit(t: Transaction, patch: TransactionPatch | null, move: CommitMove) {
    if (patch) onUpdate(t, patch);
    if (move === 1 || move === -1) {
      const next = run({ type: 'editNext', direction: move, rowIds, isEditable });
      if (!next.editing) requestAnimationFrame(() => focusCell(next.active));
      return;
    }
    const next = run({ type: 'stopEdit' });
    if (move === 'stay') requestAnimationFrame(() => focusCell(next.active));
  }

  function handleCancel() {
    const next = run({ type: 'stopEdit' });
    requestAnimationFrame(() => focusCell(next.active));
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const rowId = target.dataset.rowId;
    const col = target.dataset.column;
    if (rowId === undefined || !isEditableColumnName(col)) return;
    if (editing || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = byId.get(rowId);
    if (!t) return;
    const cell: CellRef = { rowId, column: col };
    const from = { ...state, active: cell };
    const move = (action: TableEditAction) => {
      e.preventDefault();
      const next = tableEditReducer(from, action);
      if (next.active) {
        dispatch({ type: 'focus', cell: next.active });
        focusCell(next.active);
      }
    };
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        move({ type: 'moveRow', delta: 1, rowIds });
        break;
      case 'ArrowUp':
      case 'k':
        move({ type: 'moveRow', delta: -1, rowIds });
        break;
      case 'ArrowRight':
        move({ type: 'moveColumn', delta: 1, rowIds });
        break;
      case 'ArrowLeft':
        move({ type: 'moveColumn', delta: -1, rowIds });
        break;
      case 'Home':
        move({ type: 'moveRow', delta: -rowIds.length, rowIds });
        break;
      case 'End':
        move({ type: 'moveRow', delta: rowIds.length, rowIds });
        break;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        startEdit(cell);
        break;
      case 'e':
      case 'E':
        e.preventDefault();
        handlers.onEdit(t);
        break;
      case 'x':
        e.preventDefault();
        onToggleRow(t.id, e.shiftKey);
        break;
      case 'Delete': {
        e.preventDefault();
        const i = rowIds.indexOf(t.id);
        const neighbour = rowIds[i + 1] ?? rowIds[i - 1];
        if (neighbour) {
          const nextCell = { rowId: neighbour, column: col };
          dispatch({ type: 'focus', cell: nextCell });
          focusCell(nextCell);
        }
        handlers.onDelete(t);
        break;
      }
    }
  }

  // j / k depuis la page (hors champ) : donne le focus au tableau.
  const focusTable = () => {
    if (tableRef.current?.contains(document.activeElement)) return;
    focusCell(active);
  };
  useHotkey('j', focusTable, { enabled: items.length > 0 });
  useHotkey('k', focusTable, { enabled: items.length > 0 });

  function cellProps(t: Transaction, col: EditableColumn, extraClass?: string) {
    const isActive = active?.rowId === t.id && active.column === col;
    const editable = isCellEditable(t, col);
    return {
      'data-row-id': t.id,
      'data-column': col,
      tabIndex: isActive ? 0 : -1,
      onFocus: (e: FocusEvent<HTMLTableCellElement>) => {
        if (e.target !== e.currentTarget) return;
        if (state.active?.rowId !== t.id || state.active.column !== col) {
          dispatch({ type: 'focus', cell: { rowId: t.id, column: col } });
        }
      },
      onDoubleClick: editable ? () => startEdit({ rowId: t.id, column: col }) : undefined,
      className: cn(
        'focus-visible:ring-ring outline-none focus-visible:ring-2 focus-visible:ring-inset',
        editable && 'cursor-text',
        extraClass,
      ),
    };
  }

  function renderEditor(t: Transaction, col: EditableColumn) {
    return (
      <CellEditor
        t={t}
        column={col}
        categories={categories}
        accounts={accounts}
        onCommit={(patch, move) => handleCommit(t, patch, move)}
        onCancel={handleCancel}
      />
    );
  }

  const isEditing = (t: Transaction, col: EditableColumn) =>
    editing?.rowId === t.id && editing.column === col;

  const stopDouble = (e: MouseEvent) => e.stopPropagation();

  function renderRow(row: Row<Transaction>) {
    const t = row.original;
    const category = t.categoryId ? (categoriesById.get(t.categoryId) ?? null) : null;
    const account = accountsById.get(t.accountId);
    const target = t.transferAccountId ? accountsById.get(t.transferAccountId) : undefined;
    const selected = row.getIsSelected();
    const rowActive = active?.rowId === t.id;
    return (
      <TableRow
        key={row.id}
        data-state={selected ? 'selected' : undefined}
        className={cn(rowActive && 'bg-accent/40')}
      >
        <TableCell className="w-10">
          <Checkbox
            checked={selected}
            onClick={(e) => onToggleRow(t.id, e.shiftKey)}
            onMouseDown={(e) => {
              if (e.shiftKey) e.preventDefault();
            }}
            aria-label={`Sélectionner ${t.label}`}
          />
        </TableCell>

        <TableCell {...cellProps(t, 'date', 'w-32 whitespace-nowrap')}>
          {isEditing(t, 'date') ? (
            renderEditor(t, 'date')
          ) : (
            <time dateTime={t.date}>{formatRelativeDayFR(t.date, today)}</time>
          )}
        </TableCell>

        <TableCell {...cellProps(t, 'label', 'max-w-80')}>
          {isEditing(t, 'label') ? (
            renderEditor(t, 'label')
          ) : (
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-medium">
                <span className="truncate">{t.label}</span>
                {t.recurringId && (
                  <Repeat
                    className="text-muted-foreground size-3.5 shrink-0"
                    aria-label="Récurrente"
                  />
                )}
              </p>
              {t.note && <p className="text-muted-foreground truncate text-xs">{t.note}</p>}
              {t.tags.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.tags.map((tag) => (
                    <Badge key={tag} variant="outline" className="text-[11px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </TableCell>

        <TableCell {...cellProps(t, 'category')}>
          {isEditing(t, 'category') ? (
            renderEditor(t, 'category')
          ) : t.type === 'TRANSFER' ? (
            <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
              <ArrowLeftRight className="size-4" aria-hidden />
              Virement
            </span>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              <CategoryBadge category={category} />
              {t.categorySource === 'AI' && category && (
                <>
                  <AiBadge {...(t.aiConfidence !== null ? { confidence: t.aiConfidence } : {})} />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => handlers.onConfirmCategory(t)}
                    onDoubleClick={stopDouble}
                    aria-label={`Confirmer la catégorie ${category.name} pour ${t.label}`}
                  >
                    Confirmer
                  </Button>
                </>
              )}
            </div>
          )}
        </TableCell>

        <TableCell {...cellProps(t, 'account', 'whitespace-nowrap')}>
          {isEditing(t, 'account') ? (
            renderEditor(t, 'account')
          ) : (
            <span className="text-sm">
              {account?.name ?? 'Compte inconnu'}
              {t.type === 'TRANSFER' && (
                <>
                  <span aria-hidden> → </span>
                  <span className="sr-only"> vers </span>
                  {target?.name ?? 'compte inconnu'}
                </>
              )}
            </span>
          )}
        </TableCell>

        <TableCell {...cellProps(t, 'amount', 'text-right whitespace-nowrap')}>
          {isEditing(t, 'amount') ? (
            renderEditor(t, 'amount')
          ) : (
            <Money value={t.amount} type={t.type} className="font-medium" />
          )}
        </TableCell>

        <TableCell className="w-12 text-right">
          <RowActions t={t} handlers={handlers} />
        </TableCell>
      </TableRow>
    );
  }

  const headerState = headerCheckState(selection, rowIds);

  return (
    <div className={cn('transition-opacity', busy && 'opacity-60')}>
      <p id={hintId} className="sr-only">
        Double-cliquez ou appuyez sur Entrée pour modifier une cellule, Échap pour annuler. Flèches
        ou J et K pour changer de ligne, E pour ouvrir le formulaire, Suppr pour supprimer, X pour
        sélectionner.
      </p>
      <Table
        ref={tableRef}
        role="table"
        aria-label="Transactions"
        aria-describedby={hintId}
        aria-busy={busy || undefined}
        onKeyDown={onKeyDown}
      >
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const id = header.column.id;
                if (id === 'select') {
                  return (
                    <TableHead key={header.id} className="w-10">
                      <Checkbox
                        checked={headerState}
                        onCheckedChange={onToggleAll}
                        aria-label="Tout sélectionner"
                        disabled={rowIds.length === 0}
                      />
                    </TableHead>
                  );
                }
                if (id === 'actions') {
                  return (
                    <TableHead key={header.id} className="w-12">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  );
                }
                const label = HEADER_LABELS[id] ?? id;
                if (!header.column.getCanSort() || !isSortField(id)) {
                  return <TableHead key={header.id}>{label}</TableHead>;
                }
                const sorted = header.column.getIsSorted();
                const Icon =
                  sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown;
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'
                    }
                    className={cn(id === 'amount' && 'text-right')}
                  >
                    <button
                      type="button"
                      onClick={() => onSortChange(nextSort(sort, id))}
                      className={cn(
                        'hover:text-foreground focus-visible:ring-ring -mx-1 inline-flex items-center gap-1 rounded px-1 py-1 outline-none focus-visible:ring-2',
                        sorted && 'text-foreground',
                      )}
                    >
                      {label}
                      <Icon className={cn('size-3.5', !sorted && 'opacity-50')} aria-hidden />
                      <span className="sr-only">
                        {sorted === 'asc'
                          ? ', tri croissant'
                          : sorted === 'desc'
                            ? ', tri décroissant'
                            : ', trier'}
                      </span>
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <Fragment key={g.date ?? 'all'}>
              {g.date !== null && (
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={COLUMN_COUNT} className="py-1.5">
                    <div className="text-muted-foreground flex items-center justify-between gap-4 text-xs font-medium">
                      <span>{formatRelativeDayFR(g.date, today)}</span>
                      <span className="inline-flex items-center gap-1.5">
                        Total du jour
                        <Money value={g.net} sign="always" className="text-foreground" />
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {g.items.map((t) => {
                const row = rowsById.get(t.id);
                return row ? renderRow(row) : null;
              })}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
