import type { Gift, Gifts as GiftsDoc } from '@wp/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, plannerApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Wedding planner → Gifts: every gift (and wishing-well envelope) against who gave it, and which
 * thank-you notes are done. The assistant can draft a note in your voice to start from.
 */

const aud = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(n || 0);
const newId = () => crypto.randomUUID().slice(0, 12);

export function Gifts() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [doc, setDoc] = useState<{ data: GiftsDoc; version: number } | null>(null);
  const [error, setError] = useState('');
  const [guests, setGuests] = useState<{ id: string; label: string }[]>([]);
  const [show, setShow] = useState<'all' | 'owing'>('owing');
  const [form, setForm] = useState({ from: '', invitationId: '', gift: '', amount: '' });
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDoc(await plannerApi.doc<GiftsDoc>(wid, 'gifts'));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  useEffect(() => {
    api
      .guests(wid)
      .then((r) => setGuests(r.guests.map((g) => ({ id: g.id, label: g.people.map((p) => p.name).filter(Boolean).join(' & ') })).filter((g) => g.label)))
      .catch(() => setGuests([]));
  }, [wid]);
  const needle = form.from.trim().toLowerCase();
  const matches = useMemo(() => (needle && !form.invitationId ? guests.filter((g) => g.label.toLowerCase().includes(needle)).slice(0, 5) : []), [guests, needle, form.invitationId]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!doc) return <div aria-busy="true" className="text-[#5b6a52]">Loading gifts…</div>;
  const list = doc.data.list;
  const save = async (next: Gift[], done?: string) => {
    const before = doc;
    setDoc({ ...doc, data: { list: next } });
    try {
      setDoc(await plannerApi.saveDoc(wid, 'gifts', '', { list: next }, before.version));
      if (done) toast(done);
    } catch (e) {
      setDoc(before);
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded. Make your change again.' : (e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    }
  };
  const patch = (id: string, p: Partial<Gift>, done?: string) => void save(list.map((g) => (g.id === id ? { ...g, ...p } : g)), done);
  const owing = list.filter((g) => !g.thanked);
  const cash = list.reduce((a, g) => a + g.amount, 0);
  const shown = (show === 'owing' ? owing : list).slice().sort((a, b) => Number(a.thanked) - Number(b.thanked) || b.received.localeCompare(a.received));
  const fromGuests = new Set(list.map((g) => g.invitationId).filter(Boolean));

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Gift summary" className="grid gap-3 grid-cols-3">
        {[
          ['Gifts', String(list.length)],
          ['Thank-yous to write', String(owing.length)],
          ['Wishing well', aud(cash)],
        ].map(([k, v]) => (
          <div key={k} className="flex flex-col gap-1 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
            <span className="text-[12px] font-semibold tracking-[.14em] uppercase text-[#5b6a52]">{k}</span>
            <span className="font-display text-[28px] leading-none">{v}</span>
          </div>
        ))}
      </section>

      <form
        aria-label="Add a gift"
        className="flex flex-col gap-2 p-4 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.from.trim()) return;
          void save(
            [
              ...list,
              {
                id: newId(),
                from: form.from.trim(),
                invitationId: form.invitationId,
                gift: form.gift.trim(),
                amount: Math.max(0, Number(form.amount.replace(/[^\d.]/g, '')) || 0),
                received: new Date().toISOString().slice(0, 10),
                thanked: false,
                note: '',
              },
            ],
            'Gift added',
          );
          setForm({ from: '', invitationId: '', gift: '', amount: '' });
        }}
      >
        <H2>Add a gift</H2>
        <div className="grid gap-2 sm:grid-cols-[1.3fr_1.3fr_.7fr_auto] items-end">
          <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52] relative">
            From
            <input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, invitationId: '' })} placeholder="A guest’s name" className={inputCls} />
            {matches.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 flex flex-col rounded-[10px] border border-[#e2d7bc] bg-white shadow-[0_8px_20px_rgba(0,0,0,.12)]">
                {matches.map((g) => (
                  <button key={g.id} type="button" onClick={() => setForm({ ...form, from: g.label, invitationId: g.id })} className="text-left py-2 px-3 border-0 bg-transparent text-[14px] cursor-pointer hover:bg-[#efe7d3]">
                    {g.label}
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
            Gift
            <input value={form.gift} onChange={(e) => setForm({ ...form, gift: e.target.value })} placeholder="e.g. Wishing well, Dinner set" className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
            Amount (if money)
            <input inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="$0" className={inputCls} />
          </label>
          <Pill type="submit" kind="primary" disabled={!form.from.trim()}>
            Add
          </Pill>
        </div>
      </form>

      <section aria-label="Gifts" className="flex flex-col gap-2">
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <H2>{show === 'owing' ? 'Thank-yous to write' : 'All gifts'}</H2>
          <div role="radiogroup" aria-label="Show" className="flex gap-2">
            {(
              [
                ['owing', 'To thank'],
                ['all', 'All'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={show === k}
                onClick={() => setShow(k)}
                className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${show === k ? 'bg-[#33402f] text-[#f3ecd6] border-[#33402f]' : 'bg-transparent border-[#c6b794]'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {shown.map((g) => (
          <GiftRow key={g.id} g={g} open={open === g.id} onToggle={() => setOpen(open === g.id ? null : g.id)} onChange={(p, done) => patch(g.id, p, done)} onRemove={() => window.confirm('Remove this gift?') && void save(list.filter((x) => x.id !== g.id), 'Removed')} />
        ))}
        {!shown.length && <p className="m-0 text-[14px] text-[#5b6a52]">{list.length ? 'All thanked ✓' : 'No gifts logged yet. Add them as you open them.'}</p>}
        {list.length > 0 && guests.length > 0 && (
          <span className="text-[12px] text-[#7a7466]">
            {guests.length - fromGuests.size} of {guests.length} invitations haven’t a gift logged (that’s fine: it helps spot anyone you meant to thank).
          </span>
        )}
      </section>
    </div>
  );
}

function GiftRow({ g, open, onToggle, onChange, onRemove }: { g: Gift; open: boolean; onToggle: () => void; onChange: (p: Partial<Gift>, done?: string) => void; onRemove: () => void }) {
  const { wid } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const draft = async () => {
    setBusy(true);
    setProblem('');
    try {
      const r = await plannerApi.ask(
        wid,
        `Write a warm, short thank-you note (60-90 words) from us to ${g.from} for their gift: ${g.gift || 'a gift'}${g.amount ? ` (a contribution of $${g.amount})` : ''}. Mention it specifically and that we loved having them at our wedding. Australian spelling, no subject line, sign off with our first names.`,
        [],
      );
      onChange({ note: r.answer }, 'Draft written: change anything you like');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div className="flex items-center gap-3 py-3 px-4">
        <input type="checkbox" checked={g.thanked} aria-label={`Thanked ${g.from}`} onChange={() => onChange({ thanked: !g.thanked }, g.thanked ? undefined : `Thanked ${g.from} ✓`)} className="w-[18px] h-[18px] flex-none accent-[#5d6b47]" />
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex-1 min-w-0 flex justify-between items-center gap-3 p-0 border-0 bg-transparent text-left cursor-pointer">
          <span className="min-w-0">
            <span className={`block font-medium truncate ${g.thanked ? 'line-through text-[#7a7466]' : ''}`}>{g.from}</span>
            <span className="block text-[13px] text-[#5b6a52] truncate">{[g.gift, g.amount ? aud(g.amount) : ''].filter(Boolean).join(' · ') || 'A gift'}</span>
          </span>
          <span className="text-[12px] text-[#7a7466] flex-none">{g.note ? 'Note written' : ''}</span>
        </button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 px-4 pb-4">
          <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
            Thank-you note
            <textarea rows={5} defaultValue={g.note} key={g.note} onBlur={(e) => e.target.value !== g.note && onChange({ note: e.target.value })} className={`${inputCls} resize-y`} />
          </label>
          {problem && <span role="alert" className="text-[13px] text-[#7a4a37]">{problem}</span>}
          <div className="flex gap-3 flex-wrap items-center text-[13px]">
            <Pill kind="outline" disabled={busy} onClick={() => void draft()}>
              {busy ? 'Writing…' : g.note ? 'Draft it again' : 'Draft a note for me'}
            </Pill>
            {g.note && (
              <button type="button" onClick={() => void navigator.clipboard?.writeText(g.note)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                Copy
              </button>
            )}
            <button type="button" onClick={onRemove} className="ml-auto p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]">
              Remove
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
