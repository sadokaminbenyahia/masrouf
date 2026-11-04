// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEQUENCE_TIMEOUT_MS, parseCombo, useHotkey, type HotkeyOptions } from './use-hotkey';

function Probe({
  combo,
  onFire,
  opts,
}: {
  combo: string;
  onFire: (e: KeyboardEvent) => void;
  opts?: HotkeyOptions;
}) {
  useHotkey(combo, onFire, opts);
  return (
    <>
      <input aria-label="champ" />
      <textarea aria-label="zone" />
      <div aria-label="editable" contentEditable suppressContentEditableWarning />
      <input type="checkbox" aria-label="case" />
    </>
  );
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element | Window = window) =>
  fireEvent.keyDown(target, { key, ...init });

afterEach(() => vi.useRealTimers());

describe('parseCombo', () => {
  it('lit modificateurs et séquences', () => {
    expect(parseCombo('mod+k')).toEqual([
      { key: 'k', mod: true, ctrl: false, meta: false, alt: false, shift: false },
    ]);
    expect(parseCombo('g t').map((s) => s.key)).toEqual(['g', 't']);
    expect(parseCombo('shift+?')[0]).toMatchObject({ key: '?', shift: true });
  });
});

describe('useHotkey', () => {
  it('déclenche une touche simple, pas avec un modificateur', () => {
    const fn = vi.fn();
    render(<Probe combo="n" onFire={fn} />);
    press('n', { ctrlKey: true });
    expect(fn).not.toHaveBeenCalled();
    press('n');
    expect(fn).toHaveBeenCalledTimes(1);
    press('N', { shiftKey: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('mod+k accepte Ctrl et ⌘, et empêche l’action par défaut', () => {
    const fn = vi.fn();
    render(<Probe combo="mod+k" onFire={fn} />);
    press('k');
    expect(fn).not.toHaveBeenCalled();
    const notPrevented = press('k', { ctrlKey: true });
    expect(notPrevented).toBe(false);
    press('k', { metaKey: true });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('shift+? fonctionne en AZERTY (Maj + ,) comme en QWERTY (Maj + /)', () => {
    const fn = vi.fn();
    render(<Probe combo="shift+?" onFire={fn} />);
    press('?', { shiftKey: true, code: 'KeyM' });
    press('?', { shiftKey: true, code: 'Slash' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('gère les séquences « g t » avec délai', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    render(<Probe combo="g t" onFire={fn} />);
    press('t');
    expect(fn).not.toHaveBeenCalled();
    press('g');
    press('Shift');
    press('t');
    expect(fn).toHaveBeenCalledTimes(1);
    press('g');
    press('x');
    press('t');
    expect(fn).toHaveBeenCalledTimes(1);
    press('g');
    vi.advanceTimersByTime(SEQUENCE_TIMEOUT_MS + 50);
    press('t');
    expect(fn).toHaveBeenCalledTimes(1);
    press('g');
    press('g');
    press('t');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ignore les champs éditables, sauf allowInInputs', () => {
    const fn = vi.fn();
    const { getByLabelText, unmount } = render(<Probe combo="n" onFire={fn} />);
    press('n', {}, getByLabelText('champ'));
    press('n', {}, getByLabelText('zone'));
    press('n', {}, getByLabelText('editable'));
    expect(fn).not.toHaveBeenCalled();
    press('n', {}, getByLabelText('case'));
    expect(fn).toHaveBeenCalledTimes(1);
    unmount();

    const fn2 = vi.fn();
    const r = render(<Probe combo="mod+k" onFire={fn2} opts={{ allowInInputs: true }} />);
    press('k', { ctrlKey: true }, r.getByLabelText('champ'));
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('respecte enabled=false et se désabonne au démontage', () => {
    const fn = vi.fn();
    const { rerender, unmount } = render(<Probe combo="n" onFire={fn} opts={{ enabled: false }} />);
    press('n');
    expect(fn).not.toHaveBeenCalled();
    rerender(<Probe combo="n" onFire={fn} />);
    press('n');
    expect(fn).toHaveBeenCalledTimes(1);
    unmount();
    press('n');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
