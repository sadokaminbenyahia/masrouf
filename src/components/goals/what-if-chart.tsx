'use client';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WhatIfResult } from '@/domain/ai/types';
import { formatMonthFR } from '@/domain/dates';
import { formatMoney, type Millimes } from '@/domain/money';
import { DISCREET_PLACEHOLDER } from '@/components/shared/money';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';

/** Projection cumulée (rythme actuel vs scénario) avec la cible en ligne de référence. */
export function WhatIfChart({
  timeline,
  target,
  goalName,
}: {
  timeline: WhatIfResult['timeline'];
  target: Millimes;
  goalName: string;
}) {
  const { discreet } = useDiscreetMode();
  const money = (v: number) => (discreet ? DISCREET_PLACEHOLDER : formatMoney(v, { decimals: 0 }));
  const axisMoney = (v: number) => (discreet ? '' : formatMoney(v, { compact: true }));
  const last = timeline[timeline.length - 1];
  const summary = last
    ? `Graphique : épargne cumulée pour « ${goalName} » de ${formatMonthFR(timeline[0]?.month ?? last.month)} à ${formatMonthFR(last.month)}, au rythme actuel et avec le scénario, comparée à la cible${discreet ? '' : ` de ${money(target)}`}. Détail dans le tableau ci-dessous.`
    : 'Graphique vide.';

  return (
    <figure className="grid gap-2">
      <div role="img" aria-label={summary} className="h-64 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="month"
              tickFormatter={(m: string) => formatMonthFR(m, 'short')}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              minTickGap={16}
            />
            <YAxis
              tickFormatter={axisMoney}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={discreet ? 8 : 64}
              domain={[0, (max: number) => Math.max(max, target) * 1.05]}
            />
            <Tooltip
              formatter={(value, name) => [
                typeof value === 'number' ? money(value) : String(value),
                name,
              ]}
              labelFormatter={(label) =>
                typeof label === 'string' ? formatMonthFR(label) : String(label)
              }
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--popover-foreground)',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              y={target}
              stroke="var(--success)"
              strokeDasharray="6 4"
              label={{
                value: 'Cible',
                position: 'insideTopLeft',
                fill: 'var(--success)',
                fontSize: 12,
              }}
            />
            <Line
              type="monotone"
              dataKey="baseline"
              name="Rythme actuel"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="scenario"
              name="Scénario"
              stroke="var(--primary)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Épargne cumulée projetée, mois par mois</caption>
        <thead>
          <tr>
            <th scope="col">Mois</th>
            <th scope="col">Rythme actuel</th>
            <th scope="col">Scénario</th>
          </tr>
        </thead>
        <tbody>
          {timeline.map((p) => (
            <tr key={p.month}>
              <th scope="row">{formatMonthFR(p.month)}</th>
              <td>{money(p.baseline)}</td>
              <td>{money(p.scenario)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
