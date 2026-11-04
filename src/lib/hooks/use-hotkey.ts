'use client';
/**
 * Raccourcis clavier globaux.
 *  - combo simple : 'n', '?', 'escape'
 *  - avec modificateurs : 'mod+k' (Ctrl sur Windows/Linux, ⌘ sur macOS), 'shift+?', 'alt+n'
 *  - séquence : 'g t' (g puis t en moins d'une seconde)
 * La correspondance se fait sur `event.key` (caractère produit), ce qui fonctionne en AZERTY
 * comme en QWERTY. Ignoré dans les champs éditables, sauf `allowInInputs`.
 */
import { useEffect, useEffectEvent } from 'react';

export interface HotkeyOptions {
  enabled?: boolean;
  allowInInputs?: boolean;
}

interface KeyStep {
  key: string;
  mod: boolean;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
}

export const SEQUENCE_TIMEOUT_MS = 1000;

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  plus: '+',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
};

export function parseStep(step: string): KeyStep {
  // « shift++ » ou « + » : la touche elle-même peut être « + »
  const parts =
    step === '+' ? ['+'] : step.split('+').filter((p, i, arr) => p !== '' || i === arr.length - 1);
  const rawKey = (parts.pop() ?? '').toLowerCase() || '+';
  const mods = new Set(parts.map((p) => p.toLowerCase()));
  return {
    key: KEY_ALIASES[rawKey] ?? rawKey,
    mod: mods.has('mod'),
    ctrl: mods.has('ctrl') || mods.has('control'),
    meta: mods.has('meta') || mods.has('cmd'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
  };
}

export function parseCombo(combo: string): KeyStep[] {
  return combo.trim().split(/\s+/).filter(Boolean).map(parseStep);
}

const isLetterOrDigit = (k: string) => /^[a-z0-9]$/.test(k);

export function matchesStep(e: KeyboardEvent, step: KeyStep): boolean {
  const key = e.key.toLowerCase();
  if (key !== step.key) return false;
  if (step.mod) {
    if (!(e.ctrlKey || e.metaKey)) return false;
  } else {
    if (e.ctrlKey !== step.ctrl || e.metaKey !== step.meta) return false;
  }
  if (e.altKey !== step.alt) return false;
  // Pour un caractère non alphanumérique (« ? », « / »), Maj fait partie de la frappe selon la
  // disposition (AZERTY : Maj+, ; QWERTY : Maj+/) : on n'exige pas la cohérence de Maj.
  if (isLetterOrDigit(step.key) || step.key.length > 1) {
    if (e.shiftKey !== step.shift) return false;
  }
  return true;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (el as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(
      type,
    );
  }
  return el.closest('[contenteditable=""], [contenteditable="true"], [role="textbox"]') !== null;
}

export function useHotkey(
  combo: string,
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOptions = {},
): void {
  const { enabled = true, allowInInputs = false } = opts;
  const onMatch = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;
    const steps = parseCombo(combo);
    if (steps.length === 0) return;
    let progress = 0;
    let lastAt = 0;

    const listener = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return;
      if (!allowInInputs && isEditableTarget(e.target)) return;
      // Les touches de modification seules ne font pas avancer ni n'annulent une séquence.
      if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return;

      const now = Date.now();
      if (progress > 0 && now - lastAt > SEQUENCE_TIMEOUT_MS) progress = 0;

      const expected = steps[progress];
      if (expected && matchesStep(e, expected)) {
        if (e.repeat) return;
        progress += 1;
        lastAt = now;
        if (progress === steps.length) {
          progress = 0;
          e.preventDefault();
          onMatch(e);
        }
        return;
      }
      // Mauvaise touche : on recommence (la touche peut commencer une nouvelle séquence).
      const first = steps[0];
      progress = first && steps.length > 1 && matchesStep(e, first) ? 1 : 0;
      lastAt = now;
    };

    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [combo, enabled, allowInInputs]);
}
