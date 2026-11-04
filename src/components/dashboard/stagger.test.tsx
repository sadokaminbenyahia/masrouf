// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Stagger, StaggerItem, staggerDelay } from './stagger';

function Blocks() {
  return (
    <Stagger className="space-y-4">
      <StaggerItem>Premier bloc</StaggerItem>
      <StaggerItem index={3} className="min-w-0">
        Deuxième bloc
      </StaggerItem>
    </Stagger>
  );
}

describe('Stagger', () => {
  it('le HTML serveur ne masque jamais le contenu (pas d’opacité nulle en style inline)', () => {
    const html = renderToString(<Blocks />);
    expect(html).toContain('Premier bloc');
    expect(html).not.toMatch(/opacity:\s*0/);
    expect(html).not.toMatch(/visibility:\s*hidden/);
  });

  it('désactive l’animation avec prefers-reduced-motion (classe motion-reduce)', () => {
    render(<Blocks />);
    const item = screen.getByText('Premier bloc');
    expect(item.className).toContain('motion-reduce:animate-none');
    expect(item).toBeVisible();
    expect(item.style.opacity).toBe('');
  });

  it('décale les blocs suivants, avec un plafond', () => {
    render(<Blocks />);
    expect(screen.getByText('Premier bloc').style.animationDelay).toBe('');
    expect(screen.getByText('Deuxième bloc').style.animationDelay).toBe('150ms');
    expect(staggerDelay(-2)).toBe(0);
    expect(staggerDelay(42)).toBe(400);
  });
});
