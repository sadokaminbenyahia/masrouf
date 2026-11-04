/**
 * Emplacement d'un tracé recharts pendant son chargement différé : occupe exactement la place
 * du graphique (le conteneur parent a une hauteur fixe), donc aucun décalage de mise en page.
 */
export function PlotSkeleton() {
  return (
    <div
      aria-hidden
      className="bg-muted/60 size-full animate-pulse rounded-lg motion-reduce:animate-none"
    />
  );
}

/** Anneau gris pendant le chargement (même géométrie que le donut). */
export function DonutPlotSkeleton() {
  return (
    <div aria-hidden className="flex size-full items-center justify-center">
      <div className="border-muted aspect-square h-[92%] animate-pulse rounded-full border-[18px] motion-reduce:animate-none" />
    </div>
  );
}
