import { ALL_TOOLS_ON, TOOL_HINT, TOOL_KEYS, TOOL_LABEL, type ToolKey, type Tools } from '@wp/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { isDemo } from '../../try/demoMode';
import { useAdmin } from '../Shell';
import { useToast } from '../ui';

/** The tools this wedding shows (Settings → What you're using). Unknown yet, or the sample: everything on. */
export function useTools(): { on: Tools; chosen: Tools; textsBought: boolean; credits: number | null } {
  const { overview } = useAdmin();
  const t = overview?.tools;
  if (!t) return { on: { ...ALL_TOOLS_ON }, chosen: { ...ALL_TOOLS_ON }, textsBought: true, credits: null };
  return t;
}

/** A small switch: 44 x 26, labelled for screen readers by its row. */
function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative flex-none w-[44px] h-[26px] rounded-full border-0 cursor-pointer disabled:opacity-60 transition-colors duration-150"
      style={{ background: on ? '#5d6b47' : '#d9ceb6' }}
    >
      <span aria-hidden className="absolute top-[3px] w-[20px] h-[20px] rounded-full bg-white shadow transition-transform duration-150" style={{ left: 3, transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
    </button>
  );
}

/**
 * Settings → What you're using: a switch per optional tool. Off hides it (its work is kept); on shows it in its
 * place (texts under Guests, photos and the extra pages under Invitation, the party under Plan). Text messages
 * also need text credits: switching them on goes to Text credits to buy.
 */
export function ToolsSection({ onBuyTexts }: { onBuyTexts: () => void }) {
  const { wid, reload } = useAdmin();
  const { chosen, textsBought } = useTools();
  const toast = useToast();
  const [busy, setBusy] = useState<ToolKey | ''>('');
  const flip = async (k: ToolKey, v: boolean) => {
    if (isDemo()) return toast('A sample: nothing is saved.');
    setBusy(k);
    try {
      await api.setTools(wid, { [k]: v });
      await reload();
      if (k === 'texts' && v && !textsBought) {
        toast('Text messages show once you have text credits. Buy them here, at cost.');
        onBuyTexts();
      } else toast(`${TOOL_LABEL[k]} ${v ? 'switched on' : 'switched off (nothing is deleted)'}`);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <section aria-label="What you’re using" className="flex flex-col gap-3 max-w-[720px]">
      <p className="m-0 text-[15px] text-[var(--adm-muted,#5b6a52)]">Everything is in your plan. Switch a tool on when you want it. Text messages are the only extra, charged at cost.</p>
      <ul className="m-0 p-0 list-none flex flex-col rounded-[16px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
        {TOOL_KEYS.map((k) => (
          <li key={k} className="flex items-center justify-between gap-4 min-h-[56px] px-4 py-3 border-t border-[var(--adm-line,#e2d7bc)] first:border-t-0">
            <span className="flex flex-col min-w-0">
              <span className="text-[15px] font-semibold">{TOOL_LABEL[k]}</span>
              <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">
                {TOOL_HINT[k]}
                {k === 'texts' && chosen.texts && !textsBought ? ' Shows once you buy text credits.' : ''}
              </span>
            </span>
            {/* The switch sits in a 44px-tall tap area. */}
            <span className="flex-none inline-flex items-center min-h-[44px]">
              <Switch on={chosen[k]} label={TOOL_LABEL[k]} disabled={busy === k} onChange={(v) => void flip(k, v)} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where a tool is switched off: its page offers to switch it on (never a 404, and nothing was deleted). */
export function ToolOff({ tool }: { tool: ToolKey }) {
  const { path } = useAdmin();
  return (
    <section aria-label={`${TOOL_LABEL[tool]} is switched off`} className="flex flex-col gap-3 max-w-[560px] p-5 rounded-[16px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
      <strong className="font-display font-medium text-[24px]">{TOOL_LABEL[tool]} is switched off</strong>
      <span className="text-[15px] text-[var(--adm-muted,#5b6a52)]">
        {tool === 'texts' ? 'Text messages show once you switch them on and buy text credits, at cost. ' : ''}Anything you made before is kept. Switch this on in Settings.
      </span>
      <a href={`${path('settings', 'all')}?view=${tool === 'texts' ? 'credits' : 'tools'}`} className="self-start inline-flex items-center min-h-[44px] px-5 rounded-full no-underline font-semibold bg-[#33402f] !text-[#fbf8f0]">
        Open Settings
      </a>
    </section>
  );
}
