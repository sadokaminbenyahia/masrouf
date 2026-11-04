'use client';
import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/** true sur macOS / iOS (pour afficher ⌘ plutôt que Ctrl). false au rendu serveur. */
export function useIsApplePlatform(): boolean {
  return useSyncExternalStore(
    noop,
    () => /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent),
    () => false,
  );
}
