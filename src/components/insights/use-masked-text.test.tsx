// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DiscreetModeProvider, setDiscreetMode } from '@/lib/hooks/use-discreet-mode';
import { MaskedText } from './use-masked-text';

const message = 'Vous avez dépensé 112 DT en Loisirs, contre 64 DT en moyenne (+75 %).';

afterEach(() => {
  act(() => setDiscreetMode(false));
  window.localStorage.clear();
});

describe('MaskedText (textes générés en mode discret)', () => {
  it('affiche le texte tel quel hors mode discret', () => {
    render(
      <DiscreetModeProvider>
        <p data-testid="t">
          <MaskedText text={message} />
        </p>
      </DiscreetModeProvider>,
    );
    expect(screen.getByTestId('t').textContent).toBe(message);
  });

  it('masque les montants mais garde les pourcentages en mode discret', () => {
    act(() => setDiscreetMode(true));
    render(
      <DiscreetModeProvider>
        <p data-testid="t">
          <MaskedText text={message} />
        </p>
      </DiscreetModeProvider>,
    );
    const text = screen.getByTestId('t').textContent ?? '';
    expect(text).not.toMatch(/112|64/);
    expect(text).toContain('•••');
    expect(text).toContain('+75');
  });
});
