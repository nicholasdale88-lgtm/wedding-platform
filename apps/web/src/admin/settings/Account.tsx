import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { accountApi, type Members, type Profile, type ProfilePut, type Role } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { PLAN_INFO } from '@wp/shared';
import { useUnsavedChanges } from '../leave';
import { Upgrade, usePlan } from '../Upgrade';
import { useAdmin } from '../Shell';
import { ErrorState, H2, inputCls, Label, Loading, Pill, SaveBar, useToast } from '../ui';

const ROLE: Record<Role, { label: string; what: string }> = {
  owner: { label: 'Owner', what: 'Everything, including inviting people and settings' },
  editor: { label: 'Can edit', what: 'Guests, texts, seating and planning; not people or settings' },
  viewer: { label: 'Can view', what: 'Sees everything, changes nothing (no guest links)' },
};

/** Settings → Your details: you, as the customer. Saved with the Save bar; the marketing choice is kept with its date. */
export function YourDetails() {
  const toast = useToast();
  const [p, setP] = useState<Profile | null>(null);
  const [lists, setLists] = useState<{ states: string[]; heardFrom: string[] }>({ states: [], heardFrom: [] });
  const [draft, setDraft] = useState<ProfilePut>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await accountApi.profile();
      setP(r.profile);
      setLists({ states: r.states, heardFrom: r.heardFrom });
      setDraft({});
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);
  useUnsavedChanges(Object.keys(draft).length > 0);
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!p) return <Loading />;
  const val = <K extends keyof ProfilePut>(k: K, from: string) => (draft[k] ?? from) as string;
  const set = (patch: ProfilePut) => setDraft((d) => ({ ...d, ...patch }));
  const optIn = draft.marketingOptIn ?? p.marketing.optIn;
  const save = async () => {
    setBusy(true);
    try {
      const r = await accountApi.saveProfile(draft);
      setP(r.profile);
      setDraft({});
      toast('Your details are saved');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-6 max-w-[720px]">
      <p className="m-0 text-[15px] text-[#5b6a52]">Your own details, as the person whose account this is. Your guests never see them.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Label text="First name">
          <input value={val('firstName', p.firstName)} autoComplete="given-name" maxLength={60} onChange={(e) => set({ firstName: e.target.value })} className={inputCls} />
        </Label>
        <Label text="Last name">
          <input value={val('lastName', p.lastName)} autoComplete="family-name" maxLength={60} onChange={(e) => set({ lastName: e.target.value })} className={inputCls} />
        </Label>
        <Label text="Email (you sign in with this)">
          <input value={p.email} readOnly className={`${inputCls} opacity-75`} />
        </Label>
        <Label text="Mobile">
          <input value={val('mobile', p.mobile)} type="tel" inputMode="tel" autoComplete="tel" placeholder="04xx xxx xxx" onChange={(e) => set({ mobile: e.target.value })} className={inputCls} />
        </Label>
        <Label text="State">
          <select value={val('state', p.state)} onChange={(e) => set({ state: e.target.value })} className={inputCls}>
            <option value="">Choose…</option>
            {lists.states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Label>
        <Label text="Postcode">
          <input value={val('postcode', p.postcode)} inputMode="numeric" autoComplete="postal-code" maxLength={4} onChange={(e) => set({ postcode: e.target.value.replace(/\D/g, '') })} className={inputCls} />
        </Label>
        <Label text="How did you hear about us?" className="sm:col-span-2">
          <select value={val('heardFrom', p.heardFrom)} onChange={(e) => set({ heardFrom: e.target.value })} className={inputCls}>
            <option value="">Choose…</option>
            {lists.heardFrom.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Label>
      </div>
      <label className="flex items-start gap-3 text-[15px] cursor-pointer">
        <input type="checkbox" checked={optIn} onChange={(e) => set({ marketingOptIn: e.target.checked })} className="mt-1 w-[20px] h-[20px] accent-[#5d6b47]" />
        <span>
          Send me wedding-planning tips and news by email
          <span className="block text-[13px] text-[#5b6a52]">
            {p.marketing.optIn && p.marketing.at ? `You said yes on ${fmtWhen(p.marketing.at, 'Australia/Sydney')}. ` : ''}Change your mind any time; you can always unsubscribe.
          </span>
        </span>
      </label>
      <p className="m-0 text-[13px] text-[#7a7466]">
        Customer since {fmtWhen(p.createdAt, 'Australia/Sydney')}
        {p.lastLoginAt ? ` · last signed in ${fmtWhen(p.lastLoginAt, 'Australia/Sydney')}` : ''}
      </p>
      {Object.keys(draft).length > 0 && <SaveBar busy={busy} onDiscard={() => setDraft({})} onSave={() => void save()} />}
    </div>
  );
}

/** Settings → Your plan: the plan this wedding is on, and what upgrading would add. */
export function PlanAndBilling() {
  const { plan } = usePlan();
  const info = PLAN_INFO[plan];
  return (
    <div className="flex flex-col gap-4 max-w-[720px]">
      <section aria-label="Your plan" className="flex items-center justify-between gap-4 flex-wrap p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
        <span className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold tracking-[.18em] uppercase text-[#5b6a52]">Your plan</span>
          <span className="font-display text-[28px] leading-tight">{info.name}</span>
        </span>
        <span className="text-[14px] text-[#5b6a52] max-w-[420px]">
          {plan === 'complete' ? 'Everything is included.' : `${info.price === '$0' ? 'Free' : info.price}. Texts are paid to your SMS provider, not to us.`}
        </span>
      </section>
      {plan === 'free' && <Upgrade feature="planner" compact />}
      {plan !== 'complete' && <Upgrade feature="photoQr" compact />}
    </div>
  );
}

/** Settings → Who can sign in: the people who run this wedding, and inviting your partner or a planner. */
export function TheWedding() {
  const { wid } = useAdmin();
  const toast = useToast();
  const [m, setM] = useState<Members | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('owner');
  const [link, setLink] = useState('');
  // Arriving from "Add your partner" (?invite=1): straight to the email box.
  const [params] = useSearchParams();
  const emailBox = useRef<HTMLInputElement>(null);
  const wantsInvite = params.get('invite') === '1';
  useEffect(() => {
    if (wantsInvite && m) {
      emailBox.current?.scrollIntoView?.({ block: 'center' });
      emailBox.current?.focus();
    }
  }, [wantsInvite, m]);
  const load = useCallback(async () => {
    try {
      setM(await accountApi.members(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  const run = async (f: () => Promise<unknown>, done: string) => {
    try {
      await f();
      toast(done);
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const invite = async () => {
    try {
      const r = await accountApi.invite(wid, email.trim(), role);
      setLink(r.link);
      setEmail('');
      await load();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const share = async () => {
    const text = `Join me in running our wedding admin: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'Our wedding admin', text, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Link copied');
      }
    } catch {
      /* closed the share sheet */
    }
  };
  const owner = m?.you.role === 'owner';
  return (
    <div className="flex flex-col gap-8 max-w-[860px]">
      <section aria-label="People" className="flex flex-col gap-3">
        <H2>People who run this wedding</H2>
        {error && <ErrorState message={error} onRetry={() => void load()} />}
        {!m && !error && <Loading />}
        {m?.members.map((x) => {
          const you = x.id === m.you.id;
          return (
            <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-3 border-t border-[#e2d7bc]">
              <span className="min-w-0">
                <span className="block font-semibold truncate">
                  {x.name || x.email || 'Someone'}
                  {you ? ' (you)' : ''}
                </span>
                <span className="block text-[13px] text-[#5b6a52] truncate">
                  {[x.email && x.name ? x.email : '', ROLE[x.role].what, x.lastLoginAt ? `last in ${fmtWhen(x.lastLoginAt, 'Australia/Sydney')}` : ''].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {owner && !you ? (
                  <select aria-label={`What ${x.name || x.email} can do`} value={x.role} onChange={(e) => void run(() => accountApi.setRole(wid, x.id, e.target.value as Role), 'Saved')} className={`${inputCls} !py-2`}>
                    {(Object.keys(ROLE) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE[r].label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[13px] font-medium">{ROLE[x.role].label}</span>
                )}
                {(owner || you) && (
                  <Pill
                    size="sm"
                    kind="danger"
                    onClick={() => {
                      if (window.confirm(you ? 'Leave this wedding? You won’t be able to sign in to it any more.' : `Remove ${x.name || x.email}? They won’t be able to sign in to this wedding.`))
                        void run(() => accountApi.remove(wid, x.id), you ? 'You left the wedding' : 'Removed');
                    }}
                  >
                    {you ? 'Leave' : 'Remove'}
                  </Pill>
                )}
              </span>
            </div>
          );
        })}
        {m?.invites.map((i) => (
          <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center py-3 border-t border-dashed border-[#d3c6a4]">
            <span className="min-w-0">
              <span className="block font-semibold truncate">{i.email}</span>
              <span className="block text-[13px] text-[#5b6a52]">
                Invited · {ROLE[i.role].label} · link works until {fmtWhen(i.expiresAt, 'Australia/Sydney')}
              </span>
            </span>
            <Pill size="sm" onClick={() => void run(() => accountApi.cancelInvite(wid, i.id), 'Invitation cancelled')}>
              Cancel
            </Pill>
          </div>
        ))}
      </section>

      {owner && (
        <section aria-label="Invite someone" className="flex flex-col gap-3 p-5 rounded-[16px] border border-[#e2d7bc] bg-[#fbf8f0]">
          <H2>Add your partner or a helper</H2>
          <p className="m-0 text-[14px] text-[#5b6a52]">They get a link to set their own passcode (or, if they already have an account, to add this wedding to it). It works once, for 14 days.</p>
          <form
            className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_180px_auto] gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <Label text="Their email">
              <input ref={emailBox} type="email" required value={email} autoComplete="off" onChange={(e) => setEmail(e.target.value)} className={inputCls} />
            </Label>
            <Label text="They can">
              <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
                <option value="owner">Do everything (owner)</option>
                <option value="editor">Edit (not people or settings)</option>
                <option value="viewer">Only view</option>
              </select>
            </Label>
            <Pill kind="primary" type="submit" disabled={!email.includes('@')}>
              Create the link
            </Pill>
          </form>
          {link && (
            <div className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#f6f0e2] border border-[#e2d7bc]">
              <span className="text-[13px] text-[#5b6a52]">Send them this link (shown once):</span>
              <code className="text-[13px] break-all">{link}</code>
              <span className="flex gap-2 flex-wrap">
                <Pill size="sm" kind="primary" onClick={() => void share()}>
                  Share or copy
                </Pill>
                <Pill size="sm" onClick={() => setLink('')}>
                  Done
                </Pill>
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

/** Settings → Sign-in: change the email you sign in with (needs your passcode). */
export function ChangeEmail() {
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 max-w-[420px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await accountApi.changeEmail(email.trim(), pass);
          setEmail('');
          setPass('');
          toast(`You now sign in with ${r.email}`);
        } catch (err) {
          toast((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="m-0 font-display font-medium text-[26px]">Change your email</h2>
      <Label text="New email">
        <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
      </Label>
      <Label text="Your passcode">
        <input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} className={inputCls} />
      </Label>
      <Pill kind="primary" type="submit" disabled={busy || !email.includes('@') || !pass} className="self-start">
        Change email
      </Pill>
    </form>
  );
}
