import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { cleanCode, rememberRef, savedCode } from '../src/lib/site';
import { vendorLinks, vendorMessage, VendorKit } from '../src/sales/VendorKit';

describe("a vendor's kit for recommending us to their couples", () => {
  it('their links carry who sent the couple and their code; the message names the code and the saving', () => {
    const l = vendorLinks('https://example.com', 'bloom-florals', 'BLOOM10');
    expect(l.home).toBe('https://example.com/?ref=bloom-florals&code=BLOOM10');
    expect(l.sample).toBe('https://example.com/demo?play=1&ref=bloom-florals&code=BLOOM10');
    expect(vendorMessage('BLOOM10', 10, l.home)).toMatch(/Use my code BLOOM10 for 10% off: https:\/\/example\.com\/\?ref=bloom-florals&code=BLOOM10$/);
  });

  it('a code on the link is kept for the couple (tidied), ready for when they upgrade', () => {
    expect(cleanCode(' bloom10 <x>')).toBe('BLOOM10X');
    window.history.replaceState(null, '', '/?ref=bloom-florals&code=bloom10');
    rememberRef();
    expect(savedCode()).toBe('BLOOM10');
  });

  it('shows the code, its uses, the QR and every way to share it', () => {
    render(<VendorKit name="Bloom Florals" slug="bloom-florals" code="BLOOM10" percentOff={10} uses={3} />);
    const kit = screen.getByRole('region', { name: 'Recommend us to your couples' });
    expect(kit).toHaveTextContent('BLOOM10');
    expect(kit).toHaveTextContent('used 3 times so far');
    expect(screen.getByRole('img', { name: /QR code/ })).toBeInTheDocument();
    for (const name of ['Send to a couple', 'Copy a message', 'Copy your link', 'Print cards for your counter']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See what couples see' })).toHaveAttribute('href', expect.stringContaining('/demo?play=1&ref=bloom-florals&code=BLOOM10'));
  });
});
