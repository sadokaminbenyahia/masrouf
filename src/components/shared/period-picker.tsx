'use client';
import { useId } from 'react';
import { isISODate, type ISODate } from '@/domain/dates';
import { PERIOD_LABELS, resolvePeriod, type Period, type PeriodPreset } from '@/domain/periods';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const DEFAULT_PERIOD_PRESETS: PeriodPreset[] = [
  'THIS_MONTH',
  'LAST_MONTH',
  'LAST_3_MONTHS',
  'LAST_6_MONTHS',
  'THIS_YEAR',
  'LAST_12_MONTHS',
];

export interface PeriodPickerProps {
  today: ISODate;
  value: Period;
  onChange: (p: Period) => void;
  presets?: PeriodPreset[];
  className?: string;
}

/** Chips de périodes prédéfinies + « Personnalisé » (deux champs date). */
export function PeriodPicker({
  today,
  value,
  onChange,
  presets = DEFAULT_PERIOD_PRESETS,
  className,
}: PeriodPickerProps) {
  const uid = useId();
  const chips = presets.filter((p) => p !== 'CUSTOM');
  const isCustom = value.preset === 'CUSTOM';

  const choose = (preset: PeriodPreset) => {
    if (preset === 'CUSTOM') {
      onChange({ preset, range: value.range });
      return;
    }
    onChange({ preset, range: resolvePeriod(preset, today) });
  };

  const setBound = (bound: 'from' | 'to', raw: string) => {
    if (!isISODate(raw)) return;
    let { from, to } = value.range;
    if (bound === 'from') from = raw;
    else to = raw;
    if (from > to) {
      if (bound === 'from') to = from;
      else from = to;
    }
    onChange({ preset: 'CUSTOM', range: { from, to } });
  };

  const chipClass = (active: boolean) =>
    cn(
      'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
      active
        ? 'border-primary bg-primary text-primary-foreground shadow-xs'
        : 'border-border bg-card text-muted-foreground hover:border-input hover:text-foreground',
    );

  return (
    <div data-slot="period-picker" className={cn('flex flex-col gap-3', className)}>
      <div role="group" aria-label="Période" className="flex flex-wrap gap-2">
        {chips.map((preset) => {
          const active = value.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              className={chipClass(active)}
              onClick={() => choose(preset)}
            >
              {PERIOD_LABELS[preset]}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={isCustom}
          className={chipClass(isCustom)}
          onClick={() => choose('CUSTOM')}
        >
          {PERIOD_LABELS.CUSTOM}
        </button>
      </div>
      {isCustom && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-from`}>Du</Label>
            <Input
              id={`${uid}-from`}
              type="date"
              className="w-auto"
              value={value.range.from}
              max={value.range.to}
              onChange={(e) => setBound('from', e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${uid}-to`}>Au</Label>
            <Input
              id={`${uid}-to`}
              type="date"
              className="w-auto"
              value={value.range.to}
              min={value.range.from}
              onChange={(e) => setBound('to', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
