'use client';
/**
 * Tracé recharts du donut (chargé à la demande par CategoryDonut, sans SSR : recharts reste
 * hors du bundle initial ; le total central et la légende sont rendus dès le serveur).
 */
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import type { DonutDatum } from './chart-data';
import { useChartAnimation } from './hooks';

export interface DonutPlotProps {
  data: DonutDatum[];
  activeKey: string | null;
  onActiveChange: (key: string | null) => void;
  onSelectDatum: (d: DonutDatum | undefined) => void;
  clickable: boolean;
}

export function DonutPlot({
  data,
  activeKey,
  onActiveChange,
  onSelectDatum,
  clickable,
}: DonutPlotProps) {
  const animate = useChartAnimation();
  return (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="name"
              innerRadius="64%"
              outerRadius="92%"
              paddingAngle={data.length > 1 ? 1 : 0}
              stroke="var(--card)"
              strokeWidth={2}
              startAngle={90}
              endAngle={-270}
              // Le graphique est une image (role="img") : aucun arrêt de tabulation sans nom ;
              // la légende (boutons) est l'alternative clavier.
              rootTabIndex={-1}
              isAnimationActive={animate}
              animationDuration={600}
              onMouseEnter={(_, index) => onActiveChange(data[index]?.key ?? null)}
              onMouseLeave={() => onActiveChange(null)}
              onClick={(_, index) => onSelectDatum(data[index])}
            >
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={d.color}
                  opacity={activeKey !== null && activeKey !== d.key ? 0.35 : 1}
                  style={{
                    cursor: d.slice && clickable ? 'pointer' : 'default',
                    transition: 'opacity 150ms ease',
                    outline: 'none',
                  }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
  );
}

