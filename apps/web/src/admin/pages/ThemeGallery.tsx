import { useState } from 'react';
import { isHex, paletteOf, PRESETS, THEME_NAMES, themeOf, type ThemeCustom } from '../../guest/themeKit';

/**
 * Setup → Invitation → Look and feel: every theme as a little card in its own colours (the design's five
 * and the most-chosen styles), then "make it yours": paper, ink and metallic colours, and how the names
 * are set. Simple first; the details are a tap away.
 */
export function ThemeGallery({ theme, custom, onTheme, onCustom }: { theme: string; custom: ThemeCustom; onTheme: (t: string) => void; onCustom: (c: ThemeCustom) => void }) {
  const [own, setOwn] = useState(!!(custom.paper || custom.ink || custom.accent || custom.names));
  const p = paletteOf(theme);
  const colour = (k: 'paper' | 'ink' | 'accent', label: string) => (
    <label className="flex items-center gap-2 text-[13px] text-[#5b6a52]">
      <input
        type="color"
        aria-label={label}
        value={isHex(custom[k]) ? custom[k] : p[k]}
        onChange={(e) => onCustom({ ...custom, [k]: e.target.value })}
        className="w-9 h-9 p-0 border border-[#d3c6a4] rounded-[8px] bg-transparent cursor-pointer"
      />
      {label}
    </label>
  );
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] font-semibold text-[#33402f]">Theme</span>
      <div role="radiogroup" aria-label="Theme" className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {THEME_NAMES.map((name) => {
          const t = themeOf(name);
          const on = name === theme;
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onTheme(name)}
              className={`flex flex-col gap-1 p-2 rounded-[12px] border text-left cursor-pointer ${on ? 'border-[#33402f] shadow-[0_0_0_2px_#33402f]' : 'border-[#e2d7bc] hover:border-[#b39563]'}`}
              style={{ background: t.b1 ?? '#fff' }}
            >
              {/* A tiny invitation in the theme: the names in its ink, a gold rule, its soft tint. */}
              <span className="flex flex-col items-center justify-center gap-1 h-[64px] rounded-[8px]" style={{ background: t.b2 ?? t.b1 }}>
                <span className="font-script text-[20px] leading-none" style={{ color: t.dg }}>
                  A &amp; B
                </span>
                <span className="w-8 h-[2px]" style={{ background: t.acc }} />
              </span>
              <span className="text-[12px] font-medium leading-tight" style={{ color: t.dg }}>
                {name}
                {on ? ' ✓' : ''}
              </span>
              {PRESETS[name] && <span className="text-[11px] leading-tight opacity-75" style={{ color: t.dg }}>{PRESETS[name]!.style}</span>}
            </button>
          );
        })}
      </div>
      {!own ? (
        <button type="button" onClick={() => setOwn(true)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
          Make it yours: your own colours and names style
        </button>
      ) : (
        <div className="flex flex-col gap-3 p-3 rounded-[12px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <div className="flex gap-4 flex-wrap">
            {colour('paper', 'Paper')}
            {colour('ink', 'Ink')}
            {colour('accent', 'Gold or metallic')}
          </div>
          <div role="radiogroup" aria-label="Names" className="flex gap-2 flex-wrap text-[13px]">
            {(
              [
                ['script', 'Names in script'],
                ['caps', 'Names in classic capitals'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={(custom.names ?? 'theme') === k}
                onClick={() => onCustom({ ...custom, names: k })}
                className={`py-[6px] px-3 rounded-full border cursor-pointer ${custom.names === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => onCustom({})} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#7a4a37]">
            Back to the theme’s own colours
          </button>
          <span className="text-[12px] text-[#7a7466]">Everything on the invitation follows: backgrounds, the envelope, flowers and buttons are worked out from your three colours.</span>
        </div>
      )}
    </div>
  );
}
