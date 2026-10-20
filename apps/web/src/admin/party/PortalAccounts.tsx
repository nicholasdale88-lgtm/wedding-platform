import { PARTY_PERM_LABEL, PARTY_PERMS, PERM_PRESETS, type PartyPerm } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { partyAccountsApi, type PortalMember } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, Pill, useToast } from '../ui';

/**
 * Setup → Wedding party access → Portal sign-ins: each bridesmaid, groomsman and helper can have their
 * own sign-in (email and password) to the wedding party portal. Invite them (a link to set it up), choose
 * what they can see and do, reset a password, sign them out everywhere, or remove their sign-in. Switch
 * on "sign-in needed" and their private links alone no longer open the portal.
 */
export function PortalAccounts({ couple, onChanged }: { couple: string; onChanged?: () => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [d, setD] = useState<{ signIn: boolean; members: PortalMember[] } | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [shared, setShared] = useState<{ pid: string; link: string; phone: string; kind: 'invite' | 'reset' } | null>(null);
  const load = useCallback(async () => {
    try {
      setD(await partyAccountsApi.list(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!d) return <div aria-busy="true" className="text-[#5b6a52]">Loading sign-ins…</div>;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
      await load();
      onChanged?.();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const invite = async (m: PortalMember, email: string) => {
    try {
      const r = await partyAccountsApi.invite(wid, m.personId, email || undefined);
      setShared({ pid: m.personId, link: r.link, phone: r.phone, kind: 'invite' });
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const reset = async (m: PortalMember) => {
    try {
      const r = await partyAccountsApi.reset(wid, m.personId);
      setShared({ pid: m.personId, link: r.link, phone: r.phone, kind: 'reset' });
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const setPerms = (m: PortalMember, perms: Record<PartyPerm, boolean>) => {
    setD({ ...d, members: d.members.map((x) => (x.personId === m.personId ? { ...x, perms } : x)) });
    partyAccountsApi.perms(wid, m.personId, perms).catch((e: Error) => {
      toast(e.message);
      void load();
    });
  };
  const active = d.members.filter((m) => m.account?.status === 'active').length;
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '');

  return (
    <section aria-label="Portal sign-ins" className="flex flex-col gap-3">
      <div>
        <H2>Portal sign-ins</H2>
        <p className="m-0 mt-1 text-[14px] text-[#5b6a52] max-w-[720px]">
          Give each member their own sign-in to the wedding party portal (email and password), and choose what they can see and do. Lost passwords: send them a reset link, or they can have one texted to the mobile on their invitation.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap items-center text-[13px]">
        <span className="py-1 px-3 rounded-full bg-[#eef1e4] text-[#3d4a2f]">
          {active} of {d.members.length} signed up
        </span>
        <label className="flex items-center gap-2 text-[14px] cursor-pointer">
          <input type="checkbox" role="switch" checked={d.signIn} onChange={(e) => void run(() => partyAccountsApi.settings(wid, e.target.checked), e.target.checked ? 'Sign-in needed: private links alone no longer open the portal' : 'Private links open the portal again')} className="w-[18px] h-[18px] accent-[#5d6b47]" />
          Sign-in needed (private links alone won’t open it)
        </label>
      </div>
      <ul className="list-none m-0 p-0 flex flex-col rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        {d.members.map((m) => {
          const a = m.account;
          const status = !a ? 'No sign-in yet' : a.status === 'active' ? `Signed up · ${a.email}${a.lastLogin ? ` · last in ${when(a.lastLogin)}` : ''}` : `Invited${a.inviteExpires ? ` (link good to ${when(a.inviteExpires)})` : ''}`;
          const allowed = PARTY_PERMS.filter((k) => m.perms[k]).length;
          const isOpen = open === m.personId;
          const first = m.name.split(' ')[0];
          const msg = shared?.pid === m.personId ? (shared.kind === 'invite' ? `Hi ${first}, here’s your sign-in for ${couple}’s wedding party portal: ${shared.link} (set your password; the link works for 14 days)` : `Hi ${first}, here’s a link to reset your wedding party portal password: ${shared.link} (works for 48 hours)`) : '';
          return (
            <li key={m.personId} className="flex flex-col gap-2 py-3 px-4 border-t border-[#ece3cd] first:border-t-0">
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <span className="min-w-0">
                  <span className="block font-medium">{m.name}</span>
                  <span className={`block text-[12px] ${a?.status === 'active' ? 'text-[#3d4a2f]' : 'text-[#7a7466]'}`}>
                    {m.role} · {status}
                    {a?.locked && <span className="text-[#7a4a37] font-semibold"> · locked (too many wrong passwords)</span>}
                    {m.paused && <span className="text-[#7a4a37]"> · paused</span>}
                  </span>
                </span>
                <span className="flex items-center gap-2 flex-wrap">
                  <Pill kind="outline" size="sm" onClick={() => setOpen(isOpen ? null : m.personId)}>
                    {isOpen ? 'Close' : `Can see ${allowed} of ${PARTY_PERMS.length}`}
                  </Pill>
                  {a?.status === 'active' ? (
                    <Pill kind="outline" size="sm" onClick={() => void reset(m)}>
                      Reset password
                    </Pill>
                  ) : (
                    <InviteButton m={m} onInvite={(email) => void invite(m, email)} />
                  )}
                </span>
              </div>
              {msg && (
                <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-white border border-[#e2d7bc] text-[13px]">
                  <span className="break-all select-all text-[#33402f]">{shared!.link}</span>
                  <span className="flex gap-3 flex-wrap">
                    <button type="button" onClick={() => void navigator.clipboard?.writeText(msg).then(() => toast('Copied, with a note for them'))} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                      Copy with a note
                    </button>
                    {shared!.phone && (
                      <a href={`sms:${shared!.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(msg)}`} className="!text-[#33402f]">
                        Text it from your phone
                      </a>
                    )}
                    <button type="button" onClick={() => setShared(null)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a7466]">
                      Done
                    </button>
                  </span>
                </div>
              )}
              {isOpen && (
                <div className="flex flex-col gap-3 p-3 rounded-[12px] bg-white border border-[#e2d7bc]">
                  <div className="flex gap-2 flex-wrap items-center text-[12px] text-[#5b6a52]">
                    Start from:
                    {(Object.keys(PERM_PRESETS) as (keyof typeof PERM_PRESETS)[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setPerms(m, Object.fromEntries(PARTY_PERMS.map((p) => [p, PERM_PRESETS[k].perms.includes(p)])) as Record<PartyPerm, boolean>)}
                        className="py-[3px] px-3 rounded-full border border-[#c6b794] bg-transparent cursor-pointer text-[12px] text-[#33402f]"
                      >
                        {PERM_PRESETS[k].label}
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {PARTY_PERMS.map((k) => (
                      <label key={k} className="flex items-start gap-2 text-[14px] cursor-pointer">
                        <input type="checkbox" checked={m.perms[k]} onChange={(e) => setPerms(m, { ...m.perms, [k]: e.target.checked })} className="mt-[3px] w-[16px] h-[16px] accent-[#5d6b47]" />
                        <span>
                          {PARTY_PERM_LABEL[k][0]}
                          <span className="block text-[12px] text-[#7a7466]">{PARTY_PERM_LABEL[k][1]}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  {a && (
                    <div className="flex gap-4 flex-wrap text-[13px] pt-1 border-t border-[#ece3cd]">
                      {a.status === 'active' && (
                        <button type="button" onClick={() => void run(() => partyAccountsApi.signOut(wid, m.personId), `${first} is signed out everywhere`)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                          Sign out everywhere
                        </button>
                      )}
                      {a.status === 'active' && <InviteButton m={m} label="New invite link" onInvite={(email) => void invite(m, email)} quiet />}
                      <button
                        type="button"
                        onClick={() => window.confirm(`Remove ${first}’s sign-in? They can be invited again.`) && void run(() => partyAccountsApi.remove(wid, m.personId), `${first}’s sign-in removed`)}
                        className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]"
                      >
                        Remove sign-in
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!d.members.length && <p className="m-0 text-[14px] text-[#7a7466]">No one in the wedding party yet. Add people in Wedding party first.</p>}
    </section>
  );
}

/** Invite: optionally with their email filled in for them. */
function InviteButton({ m, onInvite, label, quiet }: { m: PortalMember; onInvite: (email: string) => void; label?: string; quiet?: boolean }) {
  const [asking, setAsking] = useState(false);
  const [email, setEmail] = useState(m.account?.email ?? '');
  if (!asking)
    return quiet ? (
      <button type="button" onClick={() => setAsking(true)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#33402f]">
        {label}
      </button>
    ) : (
      <Pill kind="primary" size="sm" onClick={() => setAsking(true)}>
        {label ?? (m.account ? 'New invite link' : 'Invite')}
      </Pill>
    );
  return (
    <form
      className="flex gap-2 items-center flex-wrap"
      onSubmit={(e) => {
        e.preventDefault();
        onInvite(email.trim());
        setAsking(false);
      }}
    >
      <input type="email" placeholder="Their email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} py-[6px] text-[13px] w-[200px]`} />
      <Pill type="submit" kind="primary" size="sm">
        Make link
      </Pill>
    </form>
  );
}
