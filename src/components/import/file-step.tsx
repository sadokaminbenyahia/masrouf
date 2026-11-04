'use client';
import { useRef, useState, type DragEvent } from 'react';
import { AlertCircle, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import type { ISODate } from '@/domain/dates';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { buildSampleCsv, plural } from './import-logic';

export interface LoadedFile {
  name: string;
  size: number;
  encoding: 'UTF-8' | 'Windows-1252';
  rowCount: number;
  delimiter: string;
}

interface FileStepProps {
  loaded: LoadedFile | null;
  error: string | null;
  reading: boolean;
  sampleDates: ISODate[];
  onFile: (file: File) => void;
  onContinue: () => void;
}

const DELIMITER_LABELS: Record<string, string> = {
  ';': 'point-virgule',
  ',': 'virgule',
  '\t': 'tabulation',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

function downloadSample(dates: ISODate[]): void {
  const blob = new Blob([buildSampleCsv(dates)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'exemple-releve-masrouf.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FileStep({
  loaded,
  error,
  reading,
  sampleDates,
  onFile,
  onContinue,
}: FileStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="space-y-5">
      <label
        htmlFor="import-file"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'flex min-h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors',
          'has-[:focus-visible]:border-ring has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:ring-[3px]',
          dragging ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-accent/40',
          reading && 'pointer-events-none opacity-70',
        )}
      >
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-full">
          {reading ? (
            <Loader2
              className="size-6 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Upload className="size-6" aria-hidden="true" />
          )}
        </span>
        <span className="text-base font-medium">
          {reading ? 'Lecture du fichier…' : 'Glissez votre relevé ici'}
        </span>
        <span className="text-muted-foreground text-sm">
          ou{' '}
          <span className="text-primary font-medium underline underline-offset-4">
            parcourez vos fichiers
          </span>{' '}
          · CSV, 5 Mo maximum
        </span>
        <input
          ref={inputRef}
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          aria-label="Fichier CSV"
          aria-describedby={error ? 'import-file-error' : 'import-file-help'}
          aria-invalid={error ? true : undefined}
          className="sr-only"
          disabled={reading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            // Permet de resélectionner le même fichier après correction.
            e.target.value = '';
          }}
        />
      </label>

      <p id="import-file-help" className="text-muted-foreground text-sm">
        Exportez le relevé de votre compte au format CSV depuis l’espace en ligne de votre banque.
        Masrouf reconnaît les séparateurs « ; » et « , », les dates JJ/MM/AAAA et les colonnes débit
        / crédit.{' '}
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 align-baseline"
          onClick={() => downloadSample(sampleDates)}
        >
          <Download aria-hidden="true" />
          Télécharger un exemple
        </Button>
      </p>

      {error && (
        <Alert variant="destructive" id="import-file-error" role="alert">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Impossible de lire ce fichier</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loaded && !error && (
        <div className="bg-card flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <FileSpreadsheet className="text-primary size-8 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="truncate font-medium">{loaded.name}</p>
              <p className="text-muted-foreground text-sm">
                {formatSize(loaded.size)} · {plural(loaded.rowCount, 'ligne')} · séparateur{' '}
                {DELIMITER_LABELS[loaded.delimiter] ?? `« ${loaded.delimiter} »`} ·{' '}
                {loaded.encoding}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
              Changer de fichier
            </Button>
            <Button type="button" onClick={onContinue}>
              Continuer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
