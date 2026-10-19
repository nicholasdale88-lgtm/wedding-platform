import type { CSSProperties } from 'react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAdmin } from './Shell';
import { Eyebrow, H2, useToast } from './ui';

/** The admin's colours: a palette (or the invitation's own), whether each event keeps its own colour, text size. */
export interface AdminLookSettings {
  palette: string;
  eventColours: boolean;
  large: boolean;
}
export const DEFAULT_LOOK: AdminLookSettings = { palette: 'invitation', eventColours: true, large: false };

/** Palettes for the admin (sidebar ink, soft highlight, page background, button colour). */
export const PALETTES: Record<string, { name: string; ink: string; soft: string; bg: string; accent: string; deep: string }> = {
  sage: { name: 'Sage', ink: '#33402f', soft: '#cfd8bb', bg: '#f6f0e2', accent: '#5d6b47', deep: '#46543a' },
  eucalyptus: { name: 'Eucalyptus', ink: '#2f4a46', soft: '#c7dcd6', bg: '#f1f5f2', accent: '#4f7a72', deep: '#3b5f58' },
  navy: { name: 'Navy', ink: '#24324d', soft: '#d3dcec', bg: '#f2f4f8', accent: '#3f5a8a', deep: '#2f4670' },
  blush: { name: 'Blush', ink: '#5a3a42', soft: '#efd6da', bg: '#fbf4f3', accent: '#9a5a66', deep: '#7c4651' },
  terracotta: { name: 'Terracotta', ink: '#5b3426', soft: '#ecd0c2', bg: '#faf3ee', accent: '#a5533c', deep: '#84412f' },
  charcoal: { name: 'Charcoal', ink: '#2b2b2b', soft: '#dcdcd6', bg: '#f5f5f2', accent: '#55594f', deep: '#3f423a' },
};

/** The look as CSS variables, or null to follow the invitation's theme. */
export function lookVars(look: AdminLookSettings): CSSProperties | null {
  const p = PALETTES[look.palette];
  if (!p) return null;
  return { '--adm-ink': p.ink, '--adm-soft': p.soft, '--adm-bg': p.bg, '--adm-accent': p.accent, '--adm-accent-deep': p.deep } as CSSProperties;
}

/** Account → Admin look. Changes show straight away and are kept for everyone who runs the wedding. */
export function AdminLook() {
  const { wid, overview, reload } = useAdmin();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const look: AdminLookSettings = { ...DEFAULT_LOOK, ...overview?.wedding.adminLook };
  const save = async (patch: Partial<AdminLookSettings>) => {
    setSaving(true);
    try {
      await api.setAdminLook(wid, { ...look, ...patch });
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const swatch = (key: string, name: string, colours: string[]) => {
    const on = look.palette === key;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={on}
        disabled={saving}
        onClick={() => void save({ palette: key })}
        className={`flex flex-col gap-2 p-3 rounded-[14px] border text-left cursor-pointer bg-white ${on ? 'border-[var(--adm-ink,#33402f)] shadow-[0_0_0_2px_var(--adm-ink,#33402f)]' : 'border-[#e2d7bc] hover:border-[#b39563]'}`}
      >
        <span className="flex h-10 rounded-[8px] overflow-hidden border border-black/10">
          {colours.map((c) => (
            <span key={c} className="flex-1" style={{ background: c }} />
          ))}
        </span>
        <span className="text-[14px] font-medium">
          {name}
          {on ? ' ✓' : ''}
        </span>
      </button>
    );
  };
  return (
    <div className="flex flex-col gap-6 max-w-[860px]">
      <header>
        <Eyebrow>Account · Admin look</Eyebrow>
        <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">Admin look</h1>
        <p className="m-0 mt-1 text-[15px] text-[#5b6a52]">How this admin looks for both of you. Guests never see it.</p>
      </header>
      <section aria-label="Colours" className="flex flex-col gap-3">
        <H2>Colours</H2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
          {swatch('invitation', 'Your invitation’s', ['var(--adm-ink,#33402f)', 'var(--adm-soft,#cfd8bb)', 'var(--adm-bg,#f6f0e2)'])}
          {Object.entries(PALETTES).map(([k, p]) => swatch(k, p.name, [p.ink, p.soft, p.bg]))}
        </div>
      </section>
      <section aria-label="Options" className="flex flex-col gap-3">
        <H2>Options</H2>
        <label className="flex items-start gap-3 text-[15px] cursor-pointer">
          <input type="checkbox" checked={look.eventColours} disabled={saving} onChange={(e) => void save({ eventColours: e.target.checked })} className="mt-1 w-[18px] h-[18px] accent-[#5d6b47]" />
          <span>
            Each event in its own colour
            <span className="block text-[13px] text-[#5b6a52]">Opening the second event turns the admin its colour, so you always know which one you’re in.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-[15px] cursor-pointer">
          <input type="checkbox" checked={look.large} disabled={saving} onChange={(e) => void save({ large: e.target.checked })} className="mt-1 w-[18px] h-[18px] accent-[#5d6b47]" />
          <span>
            Larger text
            <span className="block text-[13px] text-[#5b6a52]">Easier to read on a phone.</span>
          </span>
        </label>
      </section>
    </div>
  );
}
