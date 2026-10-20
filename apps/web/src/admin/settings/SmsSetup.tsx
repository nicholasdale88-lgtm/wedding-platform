import { useCallback, useEffect, useState } from 'react';
import { ApiError, settingsApi, textsApi, type SettingsData, type SettingsPut } from '../../lib/api';
import { useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { inputCls, Label, Pill, SaveBar, useToast } from '../ui';

/**
 * Account → Texting setup (design: isSettings). Set once and left alone: your sender number and mobile,
 * pause, sending hours, daily limit, the opt-out line, automatic replies, the price per text and
 * what the whole plan costs; plus a full backup and changing your passcode.
 */

const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export function SmsSetup() {
  const { wid, reload: reloadOverview } = useAdmin();
  const toast = useToast();
  const [s, setS] = useState<SettingsData | null>(null);
  const [draft, setDraft] = useState<SettingsPut>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setS(await settingsApi.get(wid));
      setDraft({});
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  useUnsavedChanges(Object.keys(draft).length > 0);

  const save = async (body: SettingsPut, done = 'Saved') => {
    if (!s) return;
    setBusy(true);
    try {
      setS(await settingsApi.save(wid, s.version, body));
      // Only what was saved leaves the draft: Pause all texts keeps your other edits waiting for Save.
      setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !(k in body))) as SettingsPut);
      toast(done);
      void reloadOverview();
    } catch (e) {
      toast((e as Error).message);
      if (e instanceof ApiError && e.status === 409) await load();
    } finally {
      setBusy(false);
    }
  };

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!s) return <div aria-busy="true" className="text-[#5b6a52]">Loading setup…</div>;

  const val = <K extends keyof SettingsPut>(k: K) => (draft[k] ?? s[k as keyof SettingsData]) as NonNullable<SettingsPut[K]>;
  const edit = (patch: SettingsPut) => setDraft((d) => ({ ...d, ...patch, ...(patch.replies ? { replies: { ...d.replies, ...patch.replies } } : {}) }));
  const dirty = Object.keys(draft).length > 0;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex flex-col gap-7 max-w-[1000px]">
      <p className="m-0 max-w-[640px] text-[15px] text-[#5b6a52]">
        Automatic texts for a few cents each. They go out through {s.provider}, an Australian provider: you only pay for the texts you send, and guests can text YES or NO
        straight back to your number.
      </p>

      <section className="flex items-center justify-between gap-4 flex-wrap p-5 rounded-[14px]" style={{ background: s.paused ? '#f1e1d6' : '#dfe5cc' }}>
        <div>
          <div className="font-display text-[24px]">{!s.live ? 'Not set up yet' : s.paused ? 'All texts are paused' : 'Texts are live'}</div>
          <div className="text-[14px] text-[#5b6a52]">
            {!s.live ? 'Add your Mobile Message number below to start sending.' : s.paused ? 'Nothing goes out until you resume. Replies still arrive.' : `Sending from ${s.sender}, ${hourLabel(s.quietStart)} to ${hourLabel(s.quietEnd)} your time.`}
          </div>
        </div>
        {s.live && (
          <Pill kind={s.paused ? 'primary' : 'outline'} disabled={busy} onClick={() => void save({ paused: !s.paused }, s.paused ? 'Texts resumed' : 'All texts paused')}>
            {s.paused ? 'Resume texts' : 'Pause all texts'}
          </Pill>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
        <section className="flex flex-col gap-[14px]">
          <h2 className="m-0 font-display font-medium text-[26px]">Connection</h2>
          <Label text={`Your ${s.provider} number (guests see this and reply to it)`}>
            <input value={val('sender')} onChange={(e) => edit({ sender: e.target.value })} placeholder="04xx xxx xxx" className={inputCls} />
          </Label>
          <Label text="Your mobile (replies that need you are forwarded here; tests go here)">
            <input value={val('adminMobile')} onChange={(e) => edit({ adminMobile: e.target.value })} placeholder="04xx xxx xxx" className={inputCls} />
          </Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Label text="Send from">
              <select value={val('quietStart')} onChange={(e) => edit({ quietStart: Number(e.target.value) })} className={inputCls}>
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Until">
              <select value={val('quietEnd')} onChange={(e) => edit({ quietEnd: Number(e.target.value) })} className={inputCls}>
                {hours.map((h) => (
                  <option key={h} value={h}>
                    {hourLabel(h)}
                  </option>
                ))}
              </select>
            </Label>
            <Label text="Most per day">
              <input type="number" min={0} max={5000} value={val('dailyCap')} onChange={(e) => edit({ dailyCap: Number(e.target.value) })} className={inputCls} />
            </Label>
          </div>
          <Label text="Opt-out line added to every text (required by the Spam Act)">
            <input value={val('optOutFooter')} onChange={(e) => edit({ optOutFooter: e.target.value })} className={inputCls} />
          </Label>
          <TestSend wid={wid} hasMobile={!!s.adminMobile} />
        </section>

        <section className="flex flex-col gap-[14px]">
          <h2 className="m-0 font-display font-medium text-[26px]">What it will cost</h2>
          <Label text="Price per text, in cents incl. GST">
            <input type="number" step="0.01" min="0" value={val('rateX100') / 100} onChange={(e) => edit({ rateX100: Math.round(Number(e.target.value) * 100) })} className={inputCls} />
          </Label>
          <p className="m-0 text-[13px] text-[#5b6a52]">
            {s.provider === 'Texto'
              ? 'Texto charges about 3¢ per text part (less in bigger packs; credits last 12 months), plus about $15 a month for the dedicated number guests text back to. Both are counted below.'
              : 'Mobile Message charges 1.6¢ + GST (1.76¢) per text if you buy credits within 30 days of signing up; credits never expire. After that the standard rate is 4¢ + GST. New accounts get 50 free texts for testing.'}
          </p>
          <div className="flex flex-col">
            {s.plan.map((p) => (
              <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2 border-t border-[#ece3cc] text-[14px]">
                <span>{p.name}</span>
                <span className="text-right">{money(p.costCents)}</span>
                <span className="col-span-2 text-[12px] text-[#7a7466]">{p.detail}{p.auto || p.fixed ? '' : ' · sent by hand'}</span>
              </div>
            ))}
            <div className="flex justify-between py-2 border-t-2 border-[#33402f] font-semibold">
              <span>{s.provider === 'Texto' ? 'Every message once, plus the reply number' : 'Every message, once, to your current list'}</span>
              <span>{money(s.planTotalCents)}</span>
            </div>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-[14px]">
        <h2 className="m-0 font-display font-medium text-[26px]">Automatic replies</h2>
        <p className="m-0 text-[14px] text-[#5b6a52]">Sent when a guest texts back. {'{first}'}, {'{event}'} and {'{link}'} are filled in for each guest. STOP always unsubscribes them, whatever you write here.</p>
        {(
          [
            ['yes', 'When they reply YES'],
            ['no', 'When they reply NO'],
            ['multi', 'When they are invited to more than one event'],
          ] as const
        ).map(([k, label]) => (
          <Label key={k} text={label}>
            <textarea rows={2} value={draft.replies?.[k] ?? s.replies[k]} onChange={(e) => edit({ replies: { [k]: e.target.value } })} className={`${inputCls} resize-y`} />
          </Label>
        ))}
      </section>

      {dirty && <SaveBar busy={busy} onDiscard={() => setDraft({})} onSave={() => void save(draft)} />}
    </div>
  );
}

/** Settings → Backup: everything about the wedding as one file. */
export function Backup() {
  const { wid } = useAdmin();
  return (
    <section className="flex flex-col gap-3 max-w-[640px]">
      <p className="m-0 text-[15px] text-[#5b6a52]">Download everything about your wedding as one file: guests, replies, messages, seating and wording. Keep it somewhere safe.</p>
      <a href={settingsApi.backupUrl(wid)} download className="self-start py-[10px] px-[18px] rounded-full border border-[#c6b794] text-[14px] font-medium no-underline !text-[#33402f] hover:bg-[#efe7d3]">
        Download backup
      </a>
    </section>
  );
}

function TestSend({ wid, hasMobile }: { wid: string; hasMobile: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Pill
        disabled={busy || !hasMobile}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await textsApi.test(wid, 'This is a test from your wedding admin. If you got this, texts are working.');
            toast(r.stopped ? `Not sent: ${r.stopped.error}` : 'Test sent to your mobile');
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Send a test to my mobile
      </Pill>
      {!hasMobile && <span className="text-[13px] text-[#7a7466]">Save your mobile first.</span>}
    </div>
  );
}

/** Settings → Your sign-in: change the passcode (other devices are signed out). */
export function Passcode() {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3 max-w-[420px]"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await settingsApi.changePasscode(cur, next);
          setCur('');
          setNext('');
          toast('Passcode changed. Other devices are signed out.');
        } catch (err) {
          toast((err as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 className="m-0 font-display font-medium text-[26px]">Change your passcode</h2>
      <Label text="Current passcode">
        <input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className={inputCls} />
      </Label>
      <Label text="New passcode (at least 8 characters)">
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={inputCls} />
      </Label>
      <Pill kind="primary" type="submit" disabled={busy || !cur || next.length < 8} className="self-start">
        Change passcode
      </Pill>
    </form>
  );
}
