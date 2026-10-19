import type { PartySetup } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, plannerApi, type PartyData } from '../../lib/api';
import { useDocSave } from '../planner/useDocSave';
import { useAdmin } from '../Shell';
import { H2, Pill, useToast } from '../ui';
import { CoordinatorCard } from './CoordinatorCard';

/**
 * Wedding → Setup → Wedding party access: each member signs in with their own private link (nothing to
 * remember, no password to lose): their part of the run sheet, their to-dos and packing list, which they
 * tick off and add to. Switch anyone off (their page pauses), copy their link, or text it from your phone.
 */
export function PartyAccess() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [d, setD] = useState<PartyData | null>(null);
  const [error, setError] = useState('');
  const save = useDocSave<PartySetup>(wid, 'party-setup', '', d?.setup?.version);
  const load = useCallback(async () => {
    try {
      setD(await plannerApi.party(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!d) return <div aria-busy="true" className="text-[#5b6a52]">Loading the wedding party…</div>;
  const setup: PartySetup = d.setup?.data ?? { p1: 'Bride', p2: 'Groom', showOnInvite: false, access: {} };
  const couple = `${d.names.p1} & ${d.names.p2}`;
  const linkOf = (token: string) => `${window.location.origin}/w/${d.slug}/party?g=${encodeURIComponent(token)}`;
  const setAccess = async (personId: string, on: boolean) => {
    const next = { ...setup, access: { ...setup.access, [personId]: on } };
    setD({ ...d, setup: { data: next, version: d.setup?.version ?? 0 } });
    try {
      const r = await save(next);
      setD((cur) => (cur ? { ...cur, setup: { ...r, data: next } } : cur));
      toast(on ? 'They can sign in' : 'Their page is paused');
    } catch (e) {
      toast(e instanceof ApiError && e.status === 409 ? 'Changed elsewhere: reloaded.' : (e as Error).message);
      await load();
    }
  };
  const sideLabel = (s: string) => (s === 'p1' ? `${setup.p1 || 'Bride'}’s side` : s === 'p2' ? `${setup.p2 || 'Groom'}’s side` : 'Helping');
  const on = d.members.filter((m) => setup.access[m.personId] !== false);

  return (
    <section aria-label="Wedding party access" className="flex flex-col gap-4">
      <div>
        <H2>Wedding party access</H2>
        <p className="m-0 mt-1 text-[14px] text-[#5b6a52] max-w-[720px]">
          Each person signs in with their own private link: no password to remember. They see their part of the day, tick off their to-dos and packing list, and add their own. Send it by text from your phone, and tell them to
          save it to their home screen.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap text-[13px] text-[#5b6a52]">
        <span className="py-1 px-3 rounded-full bg-[#eef1e4]">{on.length} can sign in</span>
        {d.members.length > on.length && <span className="py-1 px-3 rounded-full bg-[#f4e6d8]">{d.members.length - on.length} paused</span>}
      </div>
      {!d.members.length && <p className="m-0 text-[14px] text-[#7a7466]">No one in the wedding party yet. Add people in Wedding party first.</p>}
      <ul className="list-none m-0 p-0 flex flex-col rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        {d.members.map((m) => {
          const allowed = setup.access[m.personId] !== false;
          const link = m.token ? linkOf(m.token) : '';
          const msg = `Hi ${m.name.split(' ')[0]}, here’s your wedding party page for ${couple}: ${link} It has your part of the day, your to-dos and your packing list. Save it to your home screen!`;
          return (
            <li key={m.personId} className="flex justify-between items-center gap-3 flex-wrap py-3 px-4 border-t border-[#ece3cd] first:border-t-0">
              <span className="min-w-0">
                <span className="block font-medium">{m.name}</span>
                <span className="block text-[12px] text-[#5b6a52]">
                  {m.role} · {sideLabel(m.side)}
                  {!m.phone && ' · no mobile on file'}
                </span>
              </span>
              <span className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-[14px] cursor-pointer">
                  <input type="checkbox" role="switch" checked={allowed} onChange={(e) => void setAccess(m.personId, e.target.checked)} className="w-[18px] h-[18px] accent-[#5d6b47]" />
                  {allowed ? 'Can sign in' : 'Paused'}
                </label>
                {link && allowed && (
                  <>
                    <Pill kind="outline" onClick={() => void navigator.clipboard?.writeText(link).then(() => toast(`${m.name.split(' ')[0]}’s link copied`))}>
                      Copy link
                    </Pill>
                    {m.phone && (
                      <a href={`sms:${m.phone}?&body=${encodeURIComponent(msg)}`} className="py-[7px] px-[14px] rounded-full border border-[#5d6b47] text-[13px] no-underline !text-[#33402f] hover:bg-[#efe7d3]">
                        Text it
                      </a>
                    )}
                    <a href={`${link}`} target="_blank" rel="noopener" className="text-[13px] !text-[#33402f]">
                      See their page
                    </a>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-[12px] text-[#7a7466]">“Text it” opens your phone’s messages with the link written for you (free: it’s sent from your own phone).</p>
      <CoordinatorCard />
    </section>
  );
}
