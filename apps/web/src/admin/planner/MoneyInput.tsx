import { useState, type InputHTMLAttributes } from 'react';

/** Dollars (and cents) as typed: "1,500.50" → 1500.5; never negative, never silly. */
export const moneyIn = (s: string) => Math.max(0, Math.min(10_000_000, Math.round((Number(s.replace(/[^\d.]/g, '')) || 0) * 100) / 100));

/**
 * A money field that keeps what's being typed while it has focus ("1500." stays "1500." until the
 * cents come), and shows the tidy number again on the way out.
 */
export function MoneyInput({ value, onValue, ...rest }: { value: number; onValue: (n: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <input
      {...rest}
      inputMode="decimal"
      value={typing ?? (value ? String(value) : '')}
      onFocus={(e) => {
        setTyping(value ? String(value) : '');
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setTyping(null);
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        setTyping(e.target.value);
        onValue(moneyIn(e.target.value));
      }}
    />
  );
}
