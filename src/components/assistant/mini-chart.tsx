'use client';
import { useReducedMotion } from 'framer-motion';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MiniChart as MiniChartData } from '@/domain/ai/types';
import { formatMoney, millimesToDinars } from '@/domain/money';
import { useDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { cn } from '@/lib/utils';

const DISCREET = '•••';

function color(index: number): string {
  return `var(--chart-${(index % 8) + 1})`;
}

export interface MiniChartProps {
  chart: MiniChartData;
  height?: number;
  className?: string;
}

/** Résumé textuel du graphique (nom accessible). */
function describe(chart: MiniChartData, discreet: boolean): string {
  const kind =
    chart.kind === 'pie' ? 'Camembert' : chart.kind === 'line' ? 'Courbe' : 'Histogramme';
  const values = chart.data
    .map(
      (d) => `${d.label} : ${discreet ? 'montant masqué' : formatMoney(d.value, { decimals: 0 })}`,
    )
    .join(' ; ');
  return `${kind}${chart.title ? ` « ${chart.title} »` : ''}. ${values}.`;
}

/** Petit graphique de réponse (barres, courbe ou camembert), accessible. */
export function MiniChart({ chart, height = 180, className }: MiniChartProps) {
  const { discreet } = useDiscreetMode();
  const reduceMotion = useReducedMotion() ?? false;
  const data = chart.data.map((d) => ({ label: d.label, value: millimesToDinars(d.value) }));
  const fmt = (v: unknown) =>
    discreet ? DISCREET : typeof v === 'number' ? formatMoney(Math.round(v * 1000)) : String(v);
  const tick = (v: unknown) =>
    discreet
      ? ''
      : typeof v === 'number'
        ? formatMoney(Math.round(v * 1000), { compact: true, hideCurrency: true })
        : String(v);
  const tooltip = (
    <Tooltip
      formatter={(v) => fmt(v)}
      cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
      contentStyle={{
        background: 'var(--popover)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        color: 'var(--popover-foreground)',
        fontSize: 12,
      }}
    />
  );
  const axisProps = {
    stroke: 'var(--muted-foreground)',
    fontSize: 11,
    tickLine: false,
    axisLine: false,
  } as const;

  return (
    <figure className={cn('w-full', className)}>
      {chart.title ? (
        <figcaption className="text-muted-foreground mb-2 text-xs font-medium">
          {chart.title}
        </figcaption>
      ) : null}
      <div role="img" aria-label={describe(chart, discreet)} style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.kind === 'pie' ? (
            <PieChart>
              {tooltip}
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="55%"
                outerRadius="90%"
                paddingAngle={2}
                isAnimationActive={!reduceMotion}
                stroke="var(--card)"
              >
                {data.map((d, i) => (
                  <Cell key={d.label} fill={color(i)} />
                ))}
              </Pie>
            </PieChart>
          ) : chart.kind === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} width={44} tickFormatter={tick} />
              {tooltip}
              <Line
                type="monotone"
                dataKey="value"
                name="Montant"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3 }}
                isAnimationActive={!reduceMotion}
              />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" {...axisProps} interval={0} />
              <YAxis {...axisProps} width={44} tickFormatter={tick} />
              {tooltip}
              <Bar
                dataKey="value"
                name="Montant"
                radius={[4, 4, 0, 0]}
                isAnimationActive={!reduceMotion}
              >
                {data.map((d, i) => (
                  <Cell
                    key={`${d.label}-${i}`}
                    fill={d.value < 0 ? 'var(--expense)' : 'var(--primary)'}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      {chart.kind === 'pie' ? (
        <ul
          className="text-muted-foreground mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs"
          aria-hidden="true"
        >
          {chart.data.map((d, i) => (
            <li key={d.label} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: color(i) }} />
              {d.label}
            </li>
          ))}
        </ul>
      ) : null}
      <table className="sr-only">
        <caption>{chart.title ?? 'Données du graphique'}</caption>
        <thead>
          <tr>
            <th scope="col">Libellé</th>
            <th scope="col">Montant</th>
          </tr>
        </thead>
        <tbody>
          {chart.data.map((d, i) => (
            <tr key={`${d.label}-${i}`}>
              <th scope="row">{d.label}</th>
              <td>{discreet ? 'Montant masqué' : formatMoney(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
