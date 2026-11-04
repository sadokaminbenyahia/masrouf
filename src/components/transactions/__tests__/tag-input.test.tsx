// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { normalizeTag, TagInput } from '../tag-input';

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState(initial);
  return (
    <>
      <label htmlFor="tags">Tags</label>
      <TagInput id="tags" value={tags} onChange={setTags} />
      <output data-testid="value">{tags.join('|')}</output>
    </>
  );
}

describe('normalizeTag', () => {
  it('nettoie et valide', () => {
    expect(normalizeTag('  vacances   été ')).toEqual({ tag: 'vacances été' });
    expect('error' in normalizeTag('')).toBe(true);
    expect('error' in normalizeTag('a;b')).toBe(true);
    expect('error' in normalizeTag('x'.repeat(31))).toBe(true);
  });
});

describe('TagInput', () => {
  it('ajoute avec Entrée ou virgule, sans doublon, et retire avec Retour arrière', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Tags');
    fireEvent.change(input, { target: { value: 'travail' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.change(input, { target: { value: 'Travail' } });
    fireEvent.keyDown(input, { key: ',' });
    fireEvent.change(input, { target: { value: 'famille' } });
    fireEvent.keyDown(input, { key: ',' });
    expect(screen.getByTestId('value').textContent).toBe('travail|famille');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.getByTestId('value').textContent).toBe('travail');
  });

  it('retire un tag par son bouton et ajoute la saisie en attente au blur', () => {
    render(<Harness initial={['a', 'b']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le tag a' }));
    const input = screen.getByLabelText('Tags');
    fireEvent.change(input, { target: { value: 'c, d' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('value').textContent).toBe('b|c|d');
  });

  it('affiche une erreur pour un tag trop long', () => {
    render(<Harness />);
    const input = screen.getByLabelText('Tags');
    fireEvent.change(input, { target: { value: 'x'.repeat(31) } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('30 caractères maximum.')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });
});
