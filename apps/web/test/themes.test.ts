import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/guest/generated/themes';
import { mix, MOOD_OF, PRESETS, THEME_NAMES, themeOf } from '../src/guest/themeKit';

describe('invitation themes', () => {
  it('every theme has its colours, the design’s own unchanged', () => {
    expect(THEME_NAMES.length).toBe(Object.keys(THEMES).length + Object.keys(PRESETS).length);
    for (const n of THEME_NAMES) {
      const t = themeOf(n);
      for (const k of ['b1', 'b2', 'dg', 'acc', 'e1']) expect(t[k], `${n} ${k}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(themeOf('Cream & Sage')).toEqual(THEMES['Cream & Sage']);
  });
  it('a preset is built from its palette', () => {
    const t = themeOf('Navy & Gold');
    expect(t.dg).toBe(PRESETS['Navy & Gold']!.ink);
    expect(t.acc).toBe(PRESETS['Navy & Gold']!.accent);
  });
  it('the couple’s own colours and names style go on top', () => {
    const t = themeOf('Cream & Sage', { ink: '#112233', names: 'caps' });
    expect(t.dg).toBe('#112233');
    expect(t.ntt).toBe('uppercase');
    expect(themeOf('Bridgerton Blush', { names: 'script' }).ntt).toBeUndefined();
  });
  it('every theme has a mood', () => {
    for (const n of THEME_NAMES) expect(MOOD_OF[n], n).toBeTruthy();
  });
  it('mixes colours', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
});
