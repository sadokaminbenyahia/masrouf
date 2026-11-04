'use client';
import { useId, useMemo } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, ArrowRight, ChevronDown, Loader2 } from 'lucide-react';
import type { DateFormat } from '@/domain/csv/mapping';
import { formatDateFR } from '@/domain/dates';
import type { AccountWithBalance, ImportRow } from '@/domain/types';
import { MAX_IMPORT_ROWS } from '@/lib/schemas/import';
import { Money } from '@/components/shared/money';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
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
  fileLineNumber,
  mappingProblem,
  plural,
  type ColumnChoice,
  type ColumnOption,
  type MappingState,
} from './import-logic';

const NONE = '__none__';
const LIVE_PREVIEW_ROWS = 5;
const MAX_LISTED_ERRORS = 50;

const DATE_FORMATS: { value: DateFormat; label: string }[] = [
  { value: 'DMY', label: 'JJ/MM/AAAA (12/03/2026)' },
  { value: 'YMD', label: 'AAAA-MM-JJ (2026-03-12)' },
  { value: 'MDY', label: 'MM/JJ/AAAA (03/12/2026)' },
];

export interface MappingResult {
  rows: ImportRow[];
  errors: { index: number; message: string }[];
}

interface MappingStepProps {
  options: ColumnOption[];
  state: MappingState;
  onStateChange: (s: MappingState) => void;
  hasHeader: boolean;
  onHasHeaderChange: (v: boolean) => void;
  accounts: AccountWithBalance[];
  accountsLoading: boolean;
  accountId: string | null;
  onAccountChange: (id: string) => void;
  result: MappingResult;
  dataRowCount: number;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
}

function ColumnSelect({
  label,
  value,
  options,
  optional = false,
  onChange,
}: {
  label: string;
  value: number | null;
  options: ColumnOption[];
  optional?: boolean;
  onChange: (v: number | null) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value === null ? NONE : String(value)}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Choisir une colonne" />
        </SelectTrigger>
        <SelectContent>
          {optional && <SelectItem value={NONE}>Aucune</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.index} value={String(o.index)}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function MappingStep({
  options,
  state,
  onStateChange,
  hasHeader,
  onHasHeaderChange,
  accounts,
  accountsLoading,
  accountId,
  onAccountChange,
  result,
  dataRowCount,
  pending,
  error,
  onBack,
  onContinue,
}: MappingStepProps) {
  const accountSelectId = useId();
  const formatSelectId = useId();
  const headerCheckboxId = useId();

  const setColumn = (key: keyof ColumnChoice, v: number | null) => {
    if ((key === 'date' || key === 'label') && v === null) return;
    onStateChange({ ...state, columns: { ...state.columns, [key]: v } });
  };

  const byIndex = useMemo(() => {
    const ok = new Map(result.rows.map((r) => [r.index, r]));
    const ko = new Map(result.errors.map((e) => [e.index, e.message]));
    return { ok, ko };
  }, [result]);

  const liveRows = useMemo(
    () => Array.from({ length: Math.min(LIVE_PREVIEW_ROWS, dataRowCount) }, (_, i) => i),
    [dataRowCount],
  );

  const problem =
    mappingProblem(state) ??
    (accountId === null ? 'Choisissez le compte de destination.' : null) ??
    (result.rows.length === 0 ? 'Aucune ligne lisible avec ces réglages.' : null) ??
    (result.rows.length > MAX_IMPORT_ROWS
      ? `Le fichier contient plus de ${MAX_IMPORT_ROWS} lignes : découpez-le en plusieurs imports.`
      : null);

  return (
    <div className="space-y-6">
      <section aria-labelledby="mapping-account-title" className="space-y-3">
        <h3 id="mapping-account-title" className="text-base font-semibold">
          Compte de destination
        </h3>
        {accounts.length === 0 && !accountsLoading ? (
          <Alert variant="warning">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Aucun compte</AlertTitle>
            <AlertDescription>
              <p>
                Créez d’abord un compte pour y importer vos transactions.{' '}
                <Link
                  href="/comptes"
                  className="text-primary font-medium underline underline-offset-4"
                >
                  Gérer les comptes
                </Link>
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor={accountSelectId}>Compte</Label>
            <Select
              value={accountId ?? undefined}
              onValueChange={onAccountChange}
              disabled={accountsLoading}
            >
              <SelectTrigger id={accountSelectId}>
                <SelectValue placeholder={accountsLoading ? 'Chargement…' : 'Choisir un compte'} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </section>

      <section aria-labelledby="mapping-columns-title" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 id="mapping-columns-title" className="text-base font-semibold">
            Colonnes du fichier
          </h3>
          <div className="flex min-h-11 items-center gap-2">
            <Checkbox
              id={headerCheckboxId}
              checked={hasHeader}
              onCheckedChange={(v) => onHasHeaderChange(v === true)}
            />
            <Label htmlFor={headerCheckboxId} className="font-normal">
              La première ligne contient les en-têtes
            </Label>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ColumnSelect
            label="Date"
            value={state.columns.date}
            options={options}
            onChange={(v) => setColumn('date', v)}
          />
          <div className="space-y-1.5">
            <Label htmlFor={formatSelectId}>Format de date</Label>
            <Select
              value={state.dateFormat}
              onValueChange={(v) => {
                const found = DATE_FORMATS.find((f) => f.value === v);
                if (found) onStateChange({ ...state, dateFormat: found.value });
              }}
            >
              <SelectTrigger id={formatSelectId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ColumnSelect
            label="Libellé"
            value={state.columns.label}
            options={options}
            onChange={(v) => setColumn('label', v)}
          />
          <ColumnSelect
            label="Note (facultatif)"
            value={state.columns.note}
            options={options}
            optional
            onChange={(v) => setColumn('note', v)}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Montants</legend>
          <ToggleGroup
            type="single"
            variant="outline"
            value={state.mode}
            onValueChange={(v) => {
              if (v === 'single' || v === 'split') onStateChange({ ...state, mode: v });
            }}
            aria-label="Format des montants"
          >
            <ToggleGroupItem value="single" className="px-3 sm:px-4">
              Une colonne montant
            </ToggleGroupItem>
            <ToggleGroupItem value="split" className="px-3 sm:px-4">
              Deux colonnes débit/crédit
            </ToggleGroupItem>
          </ToggleGroup>
          {state.mode === 'single' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ColumnSelect
                label="Montant"
                value={state.columns.amount}
                options={options}
                optional
                onChange={(v) => setColumn('amount', v)}
              />
              <p className="text-muted-foreground self-end pb-2 text-sm">
                Un montant négatif est une dépense, un montant positif un revenu.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ColumnSelect
                label="Débit (dépenses)"
                value={state.columns.debit}
                options={options}
                optional
                onChange={(v) => setColumn('debit', v)}
              />
              <ColumnSelect
                label="Crédit (revenus)"
                value={state.columns.credit}
                options={options}
                optional
                onChange={(v) => setColumn('credit', v)}
              />
            </div>
          )}
        </fieldset>
      </section>

      <section aria-labelledby="mapping-live-title" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="mapping-live-title" className="text-base font-semibold">
            Aperçu des premières lignes
          </h3>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {plural(result.rows.length, 'ligne lisible', 'lignes lisibles')} sur {dataRowCount}
            {result.errors.length > 0 && (
              <>
                {' · '}
                <span className="text-warning font-medium">
                  {plural(result.errors.length, 'ligne en erreur', 'lignes en erreur')}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <Table aria-label="Aperçu de l’interprétation">
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Ligne</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead>Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {liveRows.map((index) => {
                const row = byIndex.ok.get(index);
                const message = byIndex.ko.get(index);
                const line = fileLineNumber(index, hasHeader);
                if (!row) {
                  return (
                    <TableRow key={index}>
                      <TableCell className="text-muted-foreground tabular-nums">{line}</TableCell>
                      <TableCell colSpan={4} className="text-expense text-sm">
                        <AlertCircle
                          className="mr-1.5 inline size-4 align-text-bottom"
                          aria-hidden="true"
                        />
                        {message ?? 'Ligne vide, ignorée.'}
                      </TableCell>
                    </TableRow>
                  );
                }
                return (
                  <TableRow key={index}>
                    <TableCell className="text-muted-foreground tabular-nums">{line}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateFR(row.date, 'short')}
                    </TableCell>
                    <TableCell className="max-w-64 truncate" title={row.label}>
                      {row.label}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={row.amount} type={row.type} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.type === 'EXPENSE' ? 'expense' : 'income'}>
                        {row.type === 'EXPENSE' ? 'Dépense' : 'Revenu'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {result.errors.length > 0 && (
          <details className="group bg-card rounded-xl border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span>
                {plural(result.errors.length, 'ligne sera ignorée', 'lignes seront ignorées')} :
                voir le détail
              </span>
              <ChevronDown
                className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <ul className="max-h-64 space-y-1 overflow-y-auto border-t px-4 py-3 text-sm">
              {result.errors.slice(0, MAX_LISTED_ERRORS).map((e) => (
                <li key={e.index}>
                  <span className="font-medium tabular-nums">
                    Ligne {fileLineNumber(e.index, hasHeader)}
                  </span>{' '}
                  <span className="text-muted-foreground">: {e.message}</span>
                </li>
              ))}
              {result.errors.length > MAX_LISTED_ERRORS && (
                <li className="text-muted-foreground">
                  … et{' '}
                  {plural(result.errors.length - MAX_LISTED_ERRORS, 'autre ligne', 'autres lignes')}
                  .
                </li>
              )}
            </ul>
          </details>
        )}
      </section>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>L’analyse a échoué</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={pending}>
          <ArrowLeft aria-hidden="true" />
          Retour
        </Button>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {problem && (
            <p id="mapping-problem" className="text-muted-foreground text-sm">
              {problem}
            </p>
          )}
          <Button
            type="button"
            onClick={onContinue}
            disabled={problem !== null || pending}
            aria-describedby={problem ? 'mapping-problem' : undefined}
          >
            {pending ? (
              <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : null}
            Continuer
            {!pending && <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
