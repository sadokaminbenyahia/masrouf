// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AmountInput } from './amount-input';

function Harness({
  initial = null,
  spy,
}: {
  initial?: number | null;
  spy?: (v: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <label htmlFor="montant">Montant</label>
      <AmountInput
        id="montant"
        value={value}
        onChange={(v) => {
          setValue(v);
          spy?.(v);
        }}
      />
      <output data-testid="valeur">{value === null ? 'null' : String(value)}</output>
      <button type="button" onClick={() => setValue(42_000)}>
        Réinitialiser
      </button>
    </>
  );
}

const field = () => screen.getByLabelText('Montant') as HTMLInputElement;

describe('AmountInput', () => {
  it('a un clavier décimal et le suffixe DT', () => {
    render(<Harness />);
    expect(field()).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('DT')).toBeInTheDocument();
  });

  it('valide au blur : « 12,5+3 » → 15 500 millimes, texte normalisé', () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.change(field(), { target: { value: '12,5+3' } });
    expect(spy).not.toHaveBeenCalled();
    fireEvent.blur(field());
    expect(spy).toHaveBeenCalledWith(15_500);
    expect(field().value).toBe('15,500');
    expect(screen.getByTestId('valeur')).toHaveTextContent('15500');
  });

  it('accepte le point et les millimes', () => {
    render(<Harness />);
    fireEvent.change(field(), { target: { value: '3.5' } });
    fireEvent.blur(field());
    expect(screen.getByTestId('valeur')).toHaveTextContent('3500');
    fireEvent.change(field(), { target: { value: '500 millimes' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(screen.getByTestId('valeur')).toHaveTextContent('500');
  });

  it('affiche une erreur et renvoie null pour une saisie invalide', () => {
    render(<Harness initial={2_000} />);
    fireEvent.change(field(), { target: { value: 'abc' } });
    fireEvent.blur(field());
    expect(screen.getByRole('alert')).toHaveTextContent(/Montant invalide/);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveAttribute('aria-describedby', 'montant-erreur');
    expect(screen.getByTestId('valeur')).toHaveTextContent('null');
    expect(field().value).toBe('abc');
  });

  it('un champ vidé renvoie null sans erreur', () => {
    render(<Harness initial={2_000} />);
    expect(field().value).toBe('2');
    fireEvent.change(field(), { target: { value: '' } });
    fireEvent.blur(field());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('valeur')).toHaveTextContent('null');
  });

  it('suit une valeur modifiée de l’extérieur', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(field().value).toBe('42');
  });
});
