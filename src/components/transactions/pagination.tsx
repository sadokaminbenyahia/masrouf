'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PAGE_SIZES } from './query-params';

interface PaginationProps {
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

/** Pagination serveur : « Page X sur Y », précédent/suivant, taille de page. */
export function Pagination({
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const sizeLabelId = useId();
  const last = Math.max(1, pageCount);
  return (
    <nav
      aria-label="Pagination des transactions"
      className="flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex items-center gap-2 text-sm">
        <span id={sizeLabelId} className="text-muted-foreground">
          Par page
        </span>
        <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
          <SelectTrigger aria-labelledby={sizeLabelId} className="min-h-11 w-20 md:min-h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="min-h-11 md:min-h-10"
        >
          <ChevronLeft aria-hidden />
          Précédent
        </Button>
        <p className="min-w-28 text-center text-sm tabular-nums" aria-live="polite">
          Page {Math.min(page, last)} sur {last}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={page >= last}
          onClick={() => onPageChange(page + 1)}
          className="min-h-11 md:min-h-10"
        >
          Suivant
          <ChevronRight aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
