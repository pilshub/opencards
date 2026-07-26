import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Card } from './Card.js';

describe('Card artwork', () => {
  it('renders artwork for a kind present in the manifest', () => {
    render(<Card kind="cinder-initiate" testId="art-card" />);

    const image = screen.getByTestId('art-card').querySelector('image');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('href')).toBe('/art/cinder-initiate.webp');
  });

  it('keeps the procedural fallback for an unknown custom kind', () => {
    render(<Card kind="custom-unknown-kind" testId="custom-card" />);

    const card = screen.getByTestId('custom-card');
    expect(card.querySelector('image')).toBeNull();
    expect(card.textContent).toContain('custom-unknown-kind');
  });

  it('renders no artwork at all for a masked card', () => {
    render(<Card masked testId="masked-card" />);

    const card = screen.getByTestId('masked-card');
    expect(card.querySelector('image')).toBeNull();
    expect(card.querySelector('img')).toBeNull();
    expect(card.innerHTML).not.toContain('/art/');
  });
});
