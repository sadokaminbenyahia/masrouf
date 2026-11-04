/**
 * Wrappers sonner : un seul endroit pour le ton et la durée des notifications.
 * Les toasts sont annoncés via la région aria-live du <Toaster />.
 */
import { toast } from 'sonner';

export const UNDO_DURATION_MS = 6000;

export function toastSuccess(message: string): void {
  toast.success(message);
}

export function toastError(message: string): void {
  toast.error(message, { duration: 8000 });
}

export function toastInfo(message: string): void {
  toast(message);
}

/** Toast avec bouton « Annuler » (mutations réversibles). */
export function toastUndo(
  message: string,
  onUndo: () => void | Promise<void>,
  opts: { duration?: number } = {},
): void {
  toast(message, {
    duration: opts.duration ?? UNDO_DURATION_MS,
    action: {
      label: 'Annuler',
      onClick: () => {
        void Promise.resolve()
          .then(onUndo)
          .catch((e: unknown) => {
            console.error('[toastUndo] échec de l’annulation', e);
            toastError('Impossible d’annuler cette action.');
          });
      },
    },
  });
}
