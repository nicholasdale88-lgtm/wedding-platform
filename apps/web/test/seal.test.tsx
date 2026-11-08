import { ENVELOPE_PAPERS, InvitationContent, SEAL_COLOURS, SEAL_STYLES, TEMPLATES } from '@wp/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import texts from '../../../seed/texts.json';
import dynamicTexts from '../../../seed/texts.dynamic.json';
import { SealPicker } from '../src/admin/pages/SealPicker';
import type { InvitePayload } from '../src/guest/invitation/api';
import { InvitationPage } from '../src/guest/invitation/InvitationPage';
import { initialsOf, isDesignSeal, paperVars, sealDate, sealWords, WAX } from '../src/guest/invitation/WaxSeal';
import { SAMPLE_INVITE } from '../src/sales/sample';

describe('wax seal and envelope options', () => {
  it('saved invitations from before still load, and nothing new is needed', () => {
    expect(InvitationContent.safeParse({}).success).toBe(true);
    expect(InvitationContent.safeParse({ seal: 'Sandstone', envelope: { liner: 'floral' } }).success).toBe(true);
    for (const seal of SEAL_COLOURS) expect(InvitationContent.safeParse({ seal }).success, seal).toBe(true);
    for (const style of SEAL_STYLES) expect(InvitationContent.safeParse({ sealDesign: { style, letters: 'serif', text: 'O & J' } }).success, style).toBe(true);
    for (const paper of ENVELOPE_PAPERS) expect(InvitationContent.safeParse({ envelope: { paper } }).success, paper).toBe(true);
    expect(InvitationContent.safeParse({ seal: 'Purple' }).success).toBe(false);
    expect(InvitationContent.safeParse({ sealDesign: { text: 'x'.repeat(13) } }).success).toBe(false);
    expect(InvitationContent.safeParse({ envelope: { paper: 'tartan' } }).success).toBe(false);
  });

  it('offers a dozen or more wax colours, six designs and a dozen envelope papers, each drawn', () => {
    expect(SEAL_COLOURS.length).toBeGreaterThanOrEqual(12);
    expect(SEAL_COLOURS.slice(0, 3)).toEqual(['Sandstone', 'Dusty rose', 'Daphne blue']);
    for (const c of SEAL_COLOURS) expect(WAX[c], c).toBeTruthy();
    expect(SEAL_STYLES).toEqual(['classic', 'floral', 'wreath', 'single', 'heart', 'date']);
    expect(ENVELOPE_PAPERS.length).toBeGreaterThanOrEqual(9);
    for (const t of TEMPLATES) expect(SEAL_COLOURS, t.name).toContain(t.envelope.seal);
  });

  it('by default the seal is the design own, reading their initials', () => {
    expect(isDesignSeal(undefined, undefined)).toBe(true);
    expect(isDesignSeal('Dusty rose', {})).toBe(true);
    expect(isDesignSeal('Gold', {})).toBe(false);
    expect(isDesignSeal('Sandstone', { style: 'heart' })).toBe(false);
    expect(isDesignSeal('Sandstone', { letters: 'serif' })).toBe(false);
    expect(isDesignSeal('Sandstone', { text: '  ' })).toBe(true);
    expect(initialsOf('O&J', 'Olivia', 'James')).toEqual(['O', 'J']);
    expect(initialsOf('', 'Alex', 'Blair')).toEqual(['A', 'B']);
    expect(sealWords(undefined, ['O', 'J'], '20.03.27')).toBe('O & J');
    expect(sealWords({ style: 'single' }, ['O', 'J'], '')).toBe('O');
    expect(sealWords({ style: 'date' }, ['O', 'J'], '20.03.27')).toBe('20.03.27');
    expect(sealWords({ style: 'heart' }, ['O', 'J'], '')).toBe('');
    expect(sealWords({ text: ' Carter ' }, ['O', 'J'], '')).toBe('Carter');
    // The wedding's own day, where it happens (2:00pm in Sydney is early morning in London).
    expect(sealDate('2027-03-20T03:00:00.000Z', 'Australia/Sydney')).toBe('20.03.27');
    expect(sealDate('nonsense', 'Australia/Sydney')).toBe('');
  });

  it('an envelope paper changes only the envelope colours, with a light hint on a dark paper', () => {
    expect(paperVars(undefined, '#333333')).toEqual({});
    const navy = paperVars('navy', '#333333');
    expect(navy.e1).toBe('#24334f');
    expect(navy.hint).toBe('#f6efdf');
    expect(paperVars('ivory', '#333333').hint).toBe('#333333');
    expect(Object.keys(navy).sort()).toEqual(['e1', 'e2', 'e3', 'hint', 't1', 't2', 't3']);
  });

  it('the sample keeps its classic Sandstone seal', () => {
    expect(isDesignSeal(SAMPLE_INVITE.content.seal, SAMPLE_INVITE.content.sealDesign)).toBe(true);
    expect(SAMPLE_INVITE.content.envelope?.paper).toBeUndefined();
  });
});

describe('the seal picker', () => {
  const setup = (inv: InvitationContent = {}) => {
    const setInv = vi.fn();
    render(<SealPicker inv={inv} theme="Cream & Sage" initials={['O', 'J']} setInv={setInv} />);
    return setInv;
  };
  it('shows every wax colour, design and envelope paper as a swatch, with the current one ticked', () => {
    setup();
    const wax = screen.getByRole('radiogroup', { name: 'Wax colour' });
    expect(within(wax).getAllByRole('radio')).toHaveLength(SEAL_COLOURS.length);
    expect(within(wax).getByRole('radio', { name: 'Sandstone' })).toHaveAttribute('aria-checked', 'true');
    expect(within(screen.getByRole('radiogroup', { name: 'Seal design' })).getAllByRole('radio')).toHaveLength(SEAL_STYLES.length);
    const env = screen.getByRole('radiogroup', { name: 'Envelope colour' });
    expect(within(env).getAllByRole('radio')).toHaveLength(ENVELOPE_PAPERS.length + 1);
    expect(within(env).getByRole('radio', { name: /look’s own/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('img', { name: 'Seal and envelope preview' })).toBeInTheDocument();
  });
  it('saves each choice', () => {
    const setInv = setup({ envelope: { liner: 'floral' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Wax colour' })).getByRole('radio', { name: 'Rose gold' }));
    expect(setInv).toHaveBeenLastCalledWith({ seal: 'Rose gold' });
    fireEvent.click(screen.getByRole('radio', { name: /Floral emboss/ }));
    expect(setInv).toHaveBeenLastCalledWith({ sealDesign: { style: 'floral' } });
    fireEvent.click(screen.getByRole('radio', { name: /Serif capitals/ }));
    expect(setInv).toHaveBeenLastCalledWith({ sealDesign: { letters: 'serif' } });
    fireEvent.change(screen.getByLabelText('Words on the seal'), { target: { value: 'C' } });
    expect(setInv).toHaveBeenLastCalledWith({ sealDesign: { text: 'C' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Envelope colour' })).getByRole('radio', { name: /Navy/ }));
    expect(setInv).toHaveBeenLastCalledWith({ envelope: { liner: 'floral', paper: 'navy' } });
  });
});

describe('the seal on the invitation', () => {
  const TOKEN = 'B'.repeat(22);
  const payload = (content: InvitePayload['content']): InvitePayload => ({
    wedding: { slug: 'alex-and-blair', name1: 'Alex Smith', name2: 'Blair Jones', monogram: 'A&B', theme: 'Cream & Sage', timezone: 'Australia/Sydney' },
    content: { rsvpBy: 'Kindly reply by 1 May', ...content },
    texts: { ...texts, ...dynamicTexts },
    events: [{ key: 'wedding', name: 'The wedding', startsAt: '2027-03-06T05:00:00.000Z', slot: 0, questions: [] }],
    invitation: { token: TOKEN, people: [{ idx: 0, name: 'Robin Hart', diet: '' }], seatsHeld: 1, invited: ['wedding'], rsvp: {}, message: '', repliedAt: null },
  });
  const open = (data: InvitePayload) => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } }));
    return render(
      <MemoryRouter initialEntries={[`/w/alex-and-blair?g=${TOKEN}`]}>
        <Routes>
          <Route path="/w/:slug" element={<InvitationPage />} />
        </Routes>
      </MemoryRouter>,
    );
  };
  beforeEach(() => localStorage.clear());

  it('the design own seal by default (nothing drawn over it)', async () => {
    open(payload({ seal: 'Sandstone' }));
    await screen.findByText('Tap to open');
    expect(screen.queryByTestId('wax-seal')).toBeNull();
  });
  it('a date seal in gold reads the wedding day, on a navy envelope', async () => {
    open(payload({ seal: 'Gold', sealDesign: { style: 'date' }, envelope: { paper: 'navy' } }));
    await screen.findByText('Tap to open');
    expect(within(screen.getByTestId('wax-seal')).getByText('06.03.27')).toBeInTheDocument();
    expect(document.documentElement.style.getPropertyValue('--e1')).toBe('#24334f');
  });
  it('their own words on the seal', async () => {
    open(payload({ seal: 'Sandstone', sealDesign: { text: 'Hart', letters: 'serif' } }));
    await screen.findByText('Tap to open');
    expect(within(screen.getByTestId('wax-seal')).getByText('Hart')).toBeInTheDocument();
  });
});
