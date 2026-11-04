// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DISCREET_STORAGE_KEY,
  DiscreetModeProvider,
  setDiscreetMode,
  useDiscreetMode,
} from '@/lib/hooks/use-discreet-mode';
import { Money } from './money';

function Toggle() {
  const { discreet, toggle } = useDiscreetMode();
  return (
    <button type="button" onClick={toggle}>
      {discreet ? 'Afficher les montants' : 'Masquer les montants'}
    </button>
  );
}

/** formatMoney utilise une espace insécable : on la normalise pour les assertions. */
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\u00a0/g, ' ');

afterEach(() => {
  act(() => setDiscreetMode(false));
  window.localStorage.clear();
});

describe('Money', () => {
  it('formate une dépense avec « − » et la couleur dépense', () => {
    render(<Money value={12_500} type="EXPENSE" />);
    const el = screen.getByText(/12,500/);
    expect(text(el)).toBe('−12,500 DT');
    expect(el).toHaveClass('text-expense', 'tabular-nums');
  });

  it('formate un revenu avec « + » et un montant neutre sans signe', () => {
    const { container } = render(
      <>
        <Money value={2_400_000} type="INCOME" decimals={0} />
        <Money value={1_234_500} />
      </>,
    );
    const [income, neutral] = container.querySelectorAll('[data-slot="money"]');
    expect(text(income)).toBe('+2 400 DT');
    expect(income).toHaveClass('text-income');
    expect(text(neutral)).toBe('1 234,500 DT');
  });

  it('masque les montants en mode discret (texte alternatif pour les lecteurs d’écran)', () => {
    render(
      <DiscreetModeProvider>
        <Toggle />
        <Money value={12_500} type="EXPENSE" />
      </DiscreetModeProvider>,
    );
    expect(screen.getByText('−12,500 DT')).toBeInTheDocument();
    act(() => screen.getByRole('button', { name: 'Masquer les montants' }).click());
    expect(screen.queryByText(/12,500/)).not.toBeInTheDocument();
    expect(screen.getByText('Montant masqué')).toBeInTheDocument();
    expect(screen.getByText('••• DT')).toHaveAttribute('aria-hidden', 'true');
    expect(window.localStorage.getItem(DISCREET_STORAGE_KEY)).toBe('1');
    act(() => screen.getByRole('button', { name: 'Afficher les montants' }).click());
    expect(screen.getByText('−12,500 DT')).toBeInTheDocument();
  });

  it('lit l’état persisté au montage', () => {
    window.localStorage.setItem(DISCREET_STORAGE_KEY, '1');
    render(
      <DiscreetModeProvider>
        <Money value={5_000} />
      </DiscreetModeProvider>,
    );
    expect(screen.getByText('Montant masqué')).toBeInTheDocument();
  });

  it('fonctionne si localStorage est indisponible', () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('bloqué');
      },
    });
    try {
      render(
        <DiscreetModeProvider>
          <Toggle />
          <Money value={5_000} />
        </DiscreetModeProvider>,
      );
      act(() => screen.getByRole('button', { name: 'Masquer les montants' }).click());
      expect(screen.getByText('Montant masqué')).toBeInTheDocument();
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });
});
