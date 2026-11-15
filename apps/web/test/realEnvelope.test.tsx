import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RealEnvelope } from '../src/sales/RealEnvelope';

describe('the front page envelope', () => {
  // Both "relative" and "absolute" on it made it collapse to no height inside the phone (a black screen).
  it('placed by the caller (absolute, filling a phone) it is never also relative', () => {
    render(<RealEnvelope compact className="absolute inset-0" label="in a phone" />);
    const el = screen.getByRole('img', { name: 'in a phone' });
    expect(el.className.split(/\s+/)).toContain('absolute');
    expect(el.className.split(/\s+/)).not.toContain('relative');
  });
  it('on its own it is relative, so its parts sit on it', () => {
    render(<RealEnvelope className="w-full aspect-square" label="alone" />);
    expect(screen.getByRole('img', { name: 'alone' }).className.split(/\s+/)).toContain('relative');
  });
  it('bare (under a caption): the envelope and seal without its own words', () => {
    render(<RealEnvelope compact bare label="bare" />);
    expect(screen.queryByText('Tap to open')).toBeNull();
    render(<RealEnvelope compact label="dressed" />);
    expect(screen.getByText('Tap to open')).toBeInTheDocument();
  });
});
