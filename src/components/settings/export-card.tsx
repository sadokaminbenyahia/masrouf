'use client';
import { useState } from 'react';
import { DownloadIcon } from 'lucide-react';
import { formatDateFR, type ISODate } from '@/domain/dates';
import { resolvePeriod, type Period } from '@/domain/periods';
import { PeriodPicker } from '@/components/shared/period-picker';
import { Button } from '@/components/ui/button';
import { SettingsSection } from './settings-section';

export function ExportCard({ today }: { today: ISODate }) {
  const [period, setPeriod] = useState<Period>(() => ({
    preset: 'THIS_YEAR',
    range: resolvePeriod('THIS_YEAR', today),
  }));
  const { from, to } = period.range;
  const href = `/api/export/transactions?${new URLSearchParams({ from, to }).toString()}`;

  return (
    <SettingsSection
      id="export"
      title="Exporter mes transactions"
      description="Fichier CSV (séparateur « ; », UTF-8), compatible avec Excel en français."
    >
      <div className="grid gap-4">
        <PeriodPicker today={today} value={period} onChange={setPeriod} />
        <p className="text-muted-foreground text-sm">
          Du {formatDateFR(from)} au {formatDateFR(to)}.
        </p>
        <div>
          <Button asChild variant="outline">
            <a href={href} download>
              <DownloadIcon aria-hidden="true" />
              Télécharger le CSV
            </a>
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}
