'use client';
/**
 * Liste triable générique (dnd-kit) : souris/tactile (PointerSensor) et clavier
 * (KeyboardSensor : Espace pour saisir, flèches pour déplacer, Espace pour déposer, Échap
 * pour annuler). Annonces du lecteur d'écran en français. Ordre optimiste avec retour
 * arrière si `onReorder` échoue (promesse rejetée).
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useReducedMotion } from 'framer-motion';
import { GripVertical } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  SCREEN_READER_INSTRUCTIONS,
  applyOrder,
  cancelledMessage,
  droppedMessage,
  moveId,
  movedMessage,
  orderSignature,
  pickedUpMessage,
} from './reorder';

/** Propriétés à transmettre à <DragHandle /> depuis `renderItem`. */
export interface SortableHandleProps {
  label: string;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  isDragging: boolean;
  disabled: boolean;
}

export interface SortableListProps<T extends { id: string }> {
  items: readonly T[];
  /**
   * Nouvel ordre (ids). Peut mettre à jour sa source de façon optimiste. Si la promesse est
   * rejetée, la liste revient à l'ordre de `items`.
   */
  onReorder: (ids: string[]) => Promise<unknown> | void;
  renderItem: (item: T, handle: SortableHandleProps) => ReactNode;
  /** Nom lisible de l'élément (annonces, poignée « Réordonner <nom> »). */
  getLabel: (item: T) => string;
  /** Éléments non déplaçables (ex. création en cours). */
  isItemDisabled?: (item: T) => boolean;
  /** Nom accessible de la liste. */
  ariaLabel: string;
  /**
   * 'list' (défaut) : une colonne, déplacement restreint à l'axe vertical.
   * 'grid' : grille responsive (déplacement libre) — à combiner avec des classes de grille.
   */
  layout?: 'list' | 'grid';
  className?: string;
  itemClassName?: string;
}

/** Restreint le déplacement à l'axe vertical (équivalent de @dnd-kit/modifiers). */
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });
const VERTICAL_MODIFIERS = [restrictToVerticalAxis];

export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  getLabel,
  isItemDisabled,
  ariaLabel,
  layout = 'list',
  className,
  itemClassName,
}: SortableListProps<T>) {
  const reducedMotion = useReducedMotion() ?? false;
  const [override, setOverride] = useState<string[] | null>(null);
  const signature = orderSignature(items);
  const [prevSignature, setPrevSignature] = useState(signature);
  // La source a changé (mise à jour optimiste du parent, refetch…) : elle fait foi.
  if (signature !== prevSignature) {
    setPrevSignature(signature);
    setOverride(null);
  }

  const ordered = useMemo(
    () => (override ? applyOrder(items, override) : [...items]),
    [items, override],
  );
  const ids = useMemo(() => ordered.map((i) => i.id), [ordered]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const announcements = useMemo<Announcements>(() => {
    const labelOf = (id: UniqueIdentifier) => {
      const item = ordered.find((i) => i.id === String(id));
      return item ? getLabel(item) : 'Élément';
    };
    const positionOf = (id: UniqueIdentifier) => ids.indexOf(String(id)) + 1;
    const total = ids.length;
    return {
      onDragStart: ({ active }) =>
        pickedUpMessage(labelOf(active.id), positionOf(active.id), total),
      onDragOver: ({ active, over }) =>
        over ? movedMessage(labelOf(active.id), positionOf(over.id), total) : undefined,
      onDragEnd: ({ active, over }) =>
        over
          ? droppedMessage(labelOf(active.id), positionOf(over.id), total)
          : cancelledMessage(labelOf(active.id), positionOf(active.id)),
      onDragCancel: ({ active }) => cancelledMessage(labelOf(active.id), positionOf(active.id)),
    };
  }, [ordered, ids, getLabel]);

  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const previous = ids;
    const next = moveId(previous, String(active.id), String(over.id));
    setOverride(next);
    try {
      await onReorder(next);
    } catch (_error) {
      // Le parent affiche l'erreur ; on revient à l'ordre de la source.
      setOverride(null);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={layout === 'list' ? VERTICAL_MODIFIERS : undefined}
      onDragEnd={(e) => void handleDragEnd(e)}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      }}
    >
      <SortableContext
        items={ids}
        strategy={layout === 'list' ? verticalListSortingStrategy : rectSortingStrategy}
      >
        <ul
          aria-label={ariaLabel}
          className={cn(layout === 'list' ? 'flex flex-col gap-3' : 'grid gap-3', className)}
        >
          {ordered.map((item) => (
            <SortableRow
              key={item.id}
              id={item.id}
              label={getLabel(item)}
              disabled={isItemDisabled?.(item) ?? false}
              reducedMotion={reducedMotion}
              className={itemClassName}
            >
              {(handle) => renderItem(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  disabled,
  reducedMotion,
  className,
  children,
}: {
  id: string;
  label: string;
  disabled: boolean;
  reducedMotion: boolean;
  className?: string | undefined;
  children: (handle: SortableHandleProps) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    disabled,
    attributes: { roleDescription: 'élément réordonnable' },
    ...(reducedMotion ? { transition: null } : {}),
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: reducedMotion ? undefined : transition,
      }}
      className={cn(
        'relative list-none',
        isDragging && 'ring-ring/40 z-20 rounded-xl opacity-90 shadow-lg ring-2',
        className,
      )}
    >
      {children({ label, setActivatorNodeRef, attributes, listeners, isDragging, disabled })}
    </li>
  );
}

/** Poignée de glisser-déposer accessible : bouton « Réordonner <nom> ». */
export function DragHandle({
  label,
  setActivatorNodeRef,
  attributes,
  listeners,
  isDragging,
  disabled,
  className,
}: SortableHandleProps & { className?: string }) {
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`Réordonner ${label}`}
      disabled={disabled}
      className={cn(
        'text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring/50 relative z-10 inline-flex size-11 shrink-0 touch-none items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-40',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
        className,
      )}
    >
      <GripVertical className="size-5" aria-hidden="true" />
    </button>
  );
}
