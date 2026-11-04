'use client';
/**
 * Mode discret : masque les montants (consultation en public). Persisté dans localStorage
 * (accès protégé : navigation privée, stockage bloqué…) et synchronisé entre onglets.
 */
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export const DISCREET_STORAGE_KEY = 'masrouf:discreet-mode';

const listeners = new Set<() => void>();
/** Valeur de repli quand localStorage est indisponible. */
let memoryValue = false;

function readStored(): boolean {
  try {
    const raw = window.localStorage.getItem(DISCREET_STORAGE_KEY);
    return raw === null ? memoryValue : raw === '1';
  } catch {
    return memoryValue;
  }
}

export function setDiscreetMode(value: boolean): void {
  memoryValue = value;
  try {
    window.localStorage.setItem(DISCREET_STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Stockage indisponible : la valeur reste en mémoire pour la session.
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DISCREET_STORAGE_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const getServerSnapshot = () => false;

function useStoredDiscreet(): boolean {
  return useSyncExternalStore(subscribe, readStored, getServerSnapshot);
}

interface DiscreetModeValue {
  discreet: boolean;
  toggle: () => void;
  setDiscreet: (value: boolean) => void;
}

const DiscreetModeContext = createContext<DiscreetModeValue | null>(null);

export function DiscreetModeProvider({ children }: { children: ReactNode }) {
  const discreet = useStoredDiscreet();
  const toggle = useCallback(() => setDiscreetMode(!readStored()), []);
  const value = useMemo<DiscreetModeValue>(
    () => ({ discreet, toggle, setDiscreet: setDiscreetMode }),
    [discreet, toggle],
  );
  return createElement(DiscreetModeContext.Provider, { value }, children);
}

/** `{ discreet, toggle }` (fonctionne aussi hors provider, en lisant le stockage). */
export function useDiscreetMode(): DiscreetModeValue {
  const ctx = useContext(DiscreetModeContext);
  const stored = useStoredDiscreet();
  const toggle = useCallback(() => setDiscreetMode(!readStored()), []);
  return ctx ?? { discreet: stored, toggle, setDiscreet: setDiscreetMode };
}
