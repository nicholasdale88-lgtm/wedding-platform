import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { MoneyInput, moneyIn } from '../src/admin/planner/MoneyInput';

function Field() {
  const [n, setN] = useState(0);
  return (
    <>
      <MoneyInput aria-label="Amount" value={n} onValue={setN} />
      <output>{n}</output>
    </>
  );
}

describe('money fields', () => {
  it('reads dollars and cents as typed', () => {
    expect(moneyIn('$1,500.50')).toBe(1500.5);
    expect(moneyIn('-20')).toBe(20);
    expect(moneyIn('abc')).toBe(0);
    expect(moneyIn('99999999999')).toBe(10_000_000);
  });

  it('cents can be typed (the dot is kept while typing), and it tidies up on the way out', async () => {
    render(<Field />);
    const box = screen.getByLabelText('Amount');
    await userEvent.type(box, '1500.50');
    expect(box).toHaveValue('1500.50');
    expect(screen.getByRole('status')).toHaveTextContent('1500.5');
    await userEvent.tab();
    expect(box).toHaveValue('1500.5');
  });
});
