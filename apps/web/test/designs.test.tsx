import { contrastRatio, DESIGN_LIST, InvitationContent, OPENINGS, ownWording, TEMPLATES, toneOf, TONES, toneTexts, WORDING_KEYS, wordingChanges } from '@wp/shared';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesignBuilder, SHORT_HIDDEN, templatePatch } from '../src/admin/pages/DesignBuilder';
import { ORIGINAL } from '../src/admin/pages/Wording';
import { SECTIONS } from '../src/guest/generated/InvitationView.meta';
import { openingValues } from '../src/guest/invitation/openings';
import { MOOD_OF, NAMES_STYLES, PRESETS, THEME_NAMES, themeOf } from '../src/guest/themeKit';

const HEX = /^#[0-9a-f]{6}$/i;

describe('invitation templates', () => {
  it('there are twenty, each a complete, named look with its own words and opening', () => {
    expect(TEMPLATES.length).toBe(20);
    expect(new Set(TEMPLATES.map((t) => t.name)).size).toBe(20);
    for (const t of TEMPLATES) {
      for (const c of Object.values(t.palette)) expect(c, t.name).toMatch(HEX);
      expect(NAMES_STYLES[t.names], t.name).toBeTruthy();
      expect(toneOf(t.tone), t.name).toBeTruthy();
      expect(OPENINGS, t.name).toContain(t.opening);
      expect(t.name.length).toBeLessThanOrEqual(40); // the wedding's theme name
      // It's a theme like any other: in the gallery, with a mood, built from its palette.
      expect(THEME_NAMES).toContain(t.name);
      expect(MOOD_OF[t.name]).toBe(t.mood);
      expect(themeOf(t.name).dg).toBe(t.palette.ink);
      // Saved as the invitation's content without breaking its rules.
      expect(InvitationContent.safeParse(templatePatch(t, {})).success, t.name).toBe(true);
    }
    // Never the same name as an older look (one of the two would be lost).
    expect(new Set(THEME_NAMES).size).toBe(THEME_NAMES.length);
    for (const t of TEMPLATES) expect(PRESETS[t.name]!.ink).toBe(t.palette.ink);
  });

  it('the ink reads clearly on the paper and the soft tint (WCAG 4.5:1 or more)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
    for (const t of TEMPLATES) {
      expect(contrastRatio(t.palette.ink, t.palette.paper), `${t.name} ink on paper`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.palette.ink, t.palette.soft), `${t.name} ink on soft`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('every tone fills every piece, in its own words, with only the guest-name placeholder', () => {
    expect(TONES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(TONES.map((t) => t.words.invite)).size).toBe(TONES.length);
    for (const t of TONES) {
      for (const [part, key] of Object.entries(WORDING_KEYS)) {
        const w = t.words[part as keyof typeof WORDING_KEYS];
        expect(w.trim(), `${t.id} ${part}`).not.toBe('');
        expect(ORIGINAL[key], key).toBeDefined(); // a real piece of the invitation's wording
        const tags = w.match(/\{(\w+)\}/g) ?? [];
        expect(tags.every((x) => x === '{names}'), `${t.id} ${part}`).toBe(true);
      }
      expect(t.words.greet).toContain('{names}');
      expect(t.words.guideIntro.startsWith(','), t.id).toBe(true);
      expect(Object.values(t.words).join(' ')).not.toMatch(/\[|\]/);
    }
  });

  it('the short invitation hides real parts, and keeps the welcome and RSVP', () => {
    for (const s of SHORT_HIDDEN) expect(SECTIONS).toContain(s);
    expect(SHORT_HIDDEN.some((s) => /welcome|rsvp/i.test(s))).toBe(false);
  });

  it('a list for the front page: name, colours, font, tone', () => {
    expect(DESIGN_LIST).toHaveLength(20);
    expect(DESIGN_LIST[0]).toMatchObject({ name: 'Gallery White', font: 'caps', tone: 'Clean and simple', opening: 'letterpress' });
  });
});

describe('applying a tone', () => {
  const formal = toneTexts(toneOf('formal')!);
  it('fills the wording when nothing is the couple’s own', () => {
    const { changes, replacesOwn } = wordingChanges(formal, {}, ORIGINAL);
    expect(replacesOwn).toEqual([]);
    expect(changes[WORDING_KEYS.rsvp]).toBe('Kindly reply');
  });
  it('another tone’s words are not the couple’s own: switching tones replaces them freely', () => {
    const texts = toneTexts(toneOf('cheeky')!);
    expect(ownWording(texts, ORIGINAL)).toEqual([]);
    expect(wordingChanges(formal, texts, ORIGINAL).replacesOwn).toEqual([]);
  });
  it('never replaces words they typed unless they say so', () => {
    const texts = { [WORDING_KEYS.rsvp]: 'Tell us by June!' };
    const ask = wordingChanges(formal, texts, ORIGINAL);
    expect(ask.replacesOwn).toEqual([WORDING_KEYS.rsvp]);
    const keep = wordingChanges(formal, texts, ORIGINAL, true);
    expect(keep.changes[WORDING_KEYS.rsvp]).toBeUndefined();
    expect(keep.changes[WORDING_KEYS.invite]).toBe(formal[WORDING_KEYS.invite]);
  });
});

describe('the builder', () => {
  const setup = (texts: Record<string, string> = {}) => {
    const props = { setTheme: vi.fn(), setInv: vi.fn(), setTexts: vi.fn() };
    render(<DesignBuilder theme="Cream & Sage" inv={{}} texts={texts} original={ORIGINAL} {...props} />);
    return props;
  };
  it('start from a template: its look, envelope, opening and words', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /Gala Black & Gold/ }));
    expect(p.setTheme).toHaveBeenCalledWith('Gala Black & Gold');
    expect(p.setInv).toHaveBeenCalledWith(expect.objectContaining({ seal: 'Sandstone', opening: 'golddust', custom: { names: 'caps' } }));
    expect(p.setTexts).toHaveBeenCalledWith(expect.objectContaining({ [WORDING_KEYS.invite]: toneOf('formal')!.words.invite }));
  });
  it('mix and match: a wording tone on its own asks before replacing their words', () => {
    const p = setup({ [WORDING_KEYS.thanks]: 'Ta very much' });
    fireEvent.click(screen.getByRole('button', { name: /5 Wording/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Easy-going/ }));
    expect(p.setTexts).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog', { name: 'Replace your wording?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep my words' }));
    const changes = p.setTexts.mock.calls[0]![0] as Record<string, string>;
    expect(changes[WORDING_KEYS.thanks]).toBeUndefined();
    expect(changes[WORDING_KEYS.rsvp]).toBe('Will you be there?');
  });
  it('the opening step offers every animation', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: /4 Opening/ }));
    expect(screen.getAllByRole('radio')).toHaveLength(OPENINGS.length);
    fireEvent.click(screen.getByRole('radio', { name: /Gatefold/ }));
    expect(p.setInv).toHaveBeenCalledWith({ opening: 'gatefold' });
  });
});

describe('envelope openings', () => {
  const colours = { paper: '#ffffff', ink: '#111111', accent: '#c9a46a', soft: '#eeeeee' };
  const burst = [{ size: '5px', m: '-2px', c: '#fff', r: '50%', t: 'x', o: 1, d: '0s', d2: '0s' }];
  it('classic is the design’s own; the others change only movement and colour', () => {
    expect(openingValues('classic', 2, colours, { burst }, false)).toEqual({});
    for (const o of OPENINGS) {
      const v = openingValues(o, 2, colours, { burst }, false);
      for (const k of Object.keys(v)) expect(['topT', 'topOp', 'sealT', 'sealOp', 'leftT', 'rightT', 'bottomT', 'panelOp', 'envZoom', 'cardScale', 'isP1', 'burst', 'petals']).toContain(k);
    }
  });
  it('less motion: no flying pieces, nothing moves', () => {
    for (const o of OPENINGS) {
      const v = openingValues(o, 2, colours, { burst }, true);
      expect(v.petals).toEqual([]);
      expect(v.burst!.every((b) => b.o === 0)).toBe(true);
      expect(v.cardScale).toBe('none');
    }
  });
});
