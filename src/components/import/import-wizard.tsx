'use client';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { applyMapping, guessMapping, hasHeaderRow } from '@/domain/csv/mapping';
import { parseCsv } from '@/domain/csv/parse';
import { addDays, type ISODate } from '@/domain/dates';
import type {
  AccountWithBalance,
  Category,
  ImportCommitResult,
  ImportPreviewRow,
} from '@/domain/types';
import { commitImportAction, previewImportAction } from '@/app/actions/import';
import { useAccounts, useCategories } from '@/lib/hooks/use-reference-data';
import { errorMessage, queryKeys, unwrap } from '@/lib/query';
import type { ImportCommitInput, ImportPreviewInput } from '@/lib/schemas/import';
import { Card, CardContent } from '@/components/ui/card';
import { DoneStep } from './done-step';
import { FileStep, type LoadedFile } from './file-step';
import {
  buildCommitRows,
  columnOptions,
  dateSpan,
  decodeCsvBuffer,
  initialEdits,
  mappingStateFrom,
  toColumnMapping,
  transactionsHref,
  validateCsvFile,
  type MappingState,
  type RowEdits,
} from './import-logic';
import { MappingStep } from './mapping-step';
import { PreviewStep } from './preview-step';
import { IMPORT_STEPS, StepIndicator } from './step-indicator';

interface ParsedFile {
  headers: string[];
  rows: string[][];
  delimiter: string;
}

interface ImportWizardProps {
  today: ISODate;
  initialAccounts?: AccountWithBalance[];
  initialCategories?: Category[];
}

const STEP_TITLES = [
  'Choisissez votre relevé',
  'Associez les colonnes',
  'Vérifiez avant d’importer',
  'C’est fait !',
] as const;

const STEP_DESCRIPTIONS = [
  'Le fichier est lu dans votre navigateur ; seules les lignes reconnues sont envoyées.',
  'Masrouf a deviné la correspondance des colonnes : vérifiez-la sur l’aperçu.',
  'Les doublons sont repérés et une catégorie vous est suggérée pour chaque ligne.',
  '',
] as const;

const SAMPLE_OFFSETS = [-27, -25, -20, -15, -12, -9, -5, -2];

function defaultAccountId(accounts: readonly AccountWithBalance[]): string | null {
  const active = accounts.filter((a) => !a.archived);
  return (active.find((a) => a.type === 'BANK') ?? active[0])?.id ?? null;
}

export function ImportWizard({ today, initialAccounts, initialCategories }: ImportWizardProps) {
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const accountsQuery = useAccounts(initialAccounts);
  const categoriesQuery = useCategories(initialCategories);
  const accounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => !a.archived),
    [accountsQuery.data],
  );
  const categories = categoriesQuery.data ?? [];

  const [[step, direction], setStepState] = useState<[number, 1 | -1]>([0, 1]);
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileVersion, setFileVersion] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);
  /** « Nettoyer les libellés » : libellés proposés par le serveur envoyés à l'import. */
  const [cleanLabels, setCleanLabels] = useState(true);
  const [mapping, setMapping] = useState<MappingState | null>(null);
  const [chosenAccountId, setChosenAccountId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ key: string; rows: ImportPreviewRow[] } | null>(null);
  const [edits, setEdits] = useState<RowEdits>({});
  const [done, setDone] = useState<{ result: ImportCommitResult; href: string } | null>(null);

  const focusHeading = useRef(false);
  const goTo = useCallback((next: number) => {
    focusHeading.current = true;
    setStepState(([current]) => [next, next >= current ? 1 : -1]);
  }, []);

  const accountId =
    chosenAccountId !== null && accounts.some((a) => a.id === chosenAccountId)
      ? chosenAccountId
      : defaultAccountId(accounts);

  const dataRows = useMemo(() => {
    if (!parsed) return [];
    return hasHeader ? parsed.rows : [parsed.headers, ...parsed.rows];
  }, [parsed, hasHeader]);

  const options = useMemo(
    () => (parsed ? columnOptions(parsed.headers, dataRows[0], hasHeader) : []),
    [parsed, dataRows, hasHeader],
  );

  const mappingResult = useMemo(
    () => (mapping ? applyMapping(dataRows, toColumnMapping(mapping)) : { rows: [], errors: [] }),
    [dataRows, mapping],
  );

  const previewKey = useMemo(
    () => JSON.stringify({ fileVersion, accountId, hasHeader, mapping }),
    [fileVersion, accountId, hasHeader, mapping],
  );

  const previewMutation = useMutation({
    mutationFn: async (input: ImportPreviewInput & { key: string }) => {
      const { key, ...payload } = input;
      return { key, rows: unwrap(await previewImportAction(payload)) };
    },
    onSuccess: ({ key, rows }) => {
      setPreview({ key, rows });
      setEdits(initialEdits(rows));
      goTo(2);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async (input: ImportCommitInput) => unwrap(await commitImportAction(input)),
    onSuccess: (result, input) => {
      setDone({ result, href: transactionsHref(dateSpan(input.rows)) });
      goTo(3);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.transactions() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets() }),
        queryClient.invalidateQueries({ queryKey: ['ai'] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tags }),
      ]);
    },
  });

  const handleFile = async (f: File) => {
    const invalid = validateCsvFile(f);
    if (invalid) {
      setFileError(invalid);
      return;
    }
    setReading(true);
    setFileError(null);
    try {
      const { text, encoding } = decodeCsvBuffer(await f.arrayBuffer());
      const r = parseCsv(text);
      if (!r.ok) {
        setFileError(r.error);
        return;
      }
      const { headers, rows, delimiter } = r.value;
      const header = hasHeaderRow(headers);
      const all = header ? rows : [headers, ...rows];
      if (all.length === 0) {
        setFileError('Le fichier ne contient que des en-têtes, sans aucune opération.');
        return;
      }
      const guess = guessMapping(header ? headers : headers.map(() => ''), all.slice(0, 50));
      setParsed(r.value);
      setHasHeader(header);
      setMapping(mappingStateFrom(guess));
      setFile({ name: f.name, size: f.size, encoding, rowCount: all.length, delimiter });
      setFileVersion((v) => v + 1);
      setPreview(null);
      setEdits({});
      previewMutation.reset();
      commitMutation.reset();
      goTo(1);
    } catch (e: unknown) {
      console.error('[import] lecture du fichier impossible', e);
      setFileError(
        'Le fichier n’a pas pu être lu. Vérifiez qu’il s’agit bien d’un fichier texte CSV.',
      );
    } finally {
      setReading(false);
    }
  };

  const continueToPreview = () => {
    if (accountId === null || mappingResult.rows.length === 0) return;
    if (preview?.key === previewKey) {
      goTo(2);
      return;
    }
    previewMutation.mutate({ key: previewKey, accountId, rows: mappingResult.rows });
  };

  const commit = () => {
    if (accountId === null || !preview) return;
    const rows = buildCommitRows(preview.rows, edits, { cleanLabels });
    if (rows.length === 0) return;
    commitMutation.mutate({ accountId, rows });
  };

  const restart = () => {
    setFile(null);
    setParsed(null);
    setMapping(null);
    setPreview(null);
    setEdits({});
    setDone(null);
    setFileError(null);
    previewMutation.reset();
    commitMutation.reset();
    goTo(0);
  };

  const sampleDates = useMemo(() => SAMPLE_OFFSETS.map((d) => addDays(today, d)), [today]);

  const offset = reduceMotion ? 0 : 24;
  const description = STEP_DESCRIPTIONS[step] ?? '';

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <div className="border-b px-4 py-4 sm:px-6">
        <StepIndicator current={step} />
      </div>
      <CardContent className="px-4 py-6 sm:px-6">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.section
            key={step}
            aria-labelledby="import-step-title"
            initial={{ opacity: 0, x: direction * offset }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direction * offset }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
            className="space-y-5"
          >
            <header className="space-y-1">
              <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Étape {step + 1} sur {IMPORT_STEPS.length}
              </p>
              <h2
                id="import-step-title"
                tabIndex={-1}
                ref={(el) => {
                  if (el && focusHeading.current) {
                    focusHeading.current = false;
                    el.focus({ preventScroll: false });
                  }
                }}
                className="text-lg font-semibold outline-none"
              >
                {STEP_TITLES[step]}
              </h2>
              {description && <p className="text-muted-foreground text-sm">{description}</p>}
            </header>

            {step === 0 && (
              <FileStep
                loaded={file}
                error={fileError}
                reading={reading}
                sampleDates={sampleDates}
                onFile={(f) => void handleFile(f)}
                onContinue={() => goTo(1)}
              />
            )}

            {step === 1 && mapping && (
              <MappingStep
                options={options}
                state={mapping}
                onStateChange={setMapping}
                hasHeader={hasHeader}
                onHasHeaderChange={setHasHeader}
                accounts={accounts}
                accountsLoading={accountsQuery.isPending}
                accountId={accountId}
                onAccountChange={setChosenAccountId}
                result={mappingResult}
                dataRowCount={dataRows.length}
                pending={previewMutation.isPending}
                error={previewMutation.error ? errorMessage(previewMutation.error) : null}
                onBack={() => {
                  previewMutation.reset();
                  goTo(0);
                }}
                onContinue={continueToPreview}
              />
            )}

            {step === 2 && preview && (
              <PreviewStep
                rows={preview.rows}
                edits={edits}
                onEditsChange={setEdits}
                cleanLabels={cleanLabels}
                onCleanLabelsChange={setCleanLabels}
                categories={categories}
                pending={commitMutation.isPending}
                error={commitMutation.error ? errorMessage(commitMutation.error) : null}
                onBack={() => {
                  commitMutation.reset();
                  goTo(1);
                }}
                onCommit={commit}
              />
            )}

            {step === 3 && done && (
              <DoneStep result={done.result} transactionsHref={done.href} onRestart={restart} />
            )}
          </motion.section>
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
