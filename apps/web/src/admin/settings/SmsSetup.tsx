import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, backupsApi, settingsApi, textsApi, type BackupStatus, type SettingsData, type SettingsPut } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { inputCls, Label, Pill, Rollup, SaveBar, useToast } from '../ui';

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
  if (!s) return <div aria-busy="true" className="text-[var(--adm-muted,#5b6a52)]">Loading setup…</div>;

  const val = <K extends keyof SettingsPut>(k: K) => (draft[k] ?? s[k as keyof SettingsData]) as NonNullable<SettingsPut[K]>;
  const edit = (patch: SettingsPut) => setDraft((d) => ({ ...d, ...patch, ...(patch.replies ? { replies: { ...d.replies, ...patch.replies } } : {}) }));
  const dirty = Object.keys(draft).length > 0;
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="flex flex-col gap-7 max-w-[1000px]">
      <p className="m-0 max-w-[640px] text-[15px] text-[var(--adm-muted,#5b6a52)]">
        Automatic texts, sent for you through {s.provider}, an Australian provider. Guests can text YES or NO straight back.
      </p>

      <TextCredits s={s} wid={wid} />

      <section className="flex items-center justify-between gap-4 flex-wrap p-5 rounded-[14px]" style={{ background: s.paused ? '#f1e1d6' : '#dfe5cc' }}>
        <div>
          <div className="font-display text-[24px]">{!s.live ? 'Not set up yet' : s.paused ? 'All texts are paused' : 'Texts are live'}</div>
          <div className="text-[14px] text-[var(--adm-muted,#5b6a52)]">
            {!s.live ? 'Only for automatic texts from a texting number. Sending free from your own phone or by email? You can skip this.' : s.paused ? 'Nothing goes out until you resume. Replies still arrive.' : `Sending from ${s.sender}, ${hourLabel(s.quietStart)} to ${hourLabel(s.quietEnd)} your time.`}
          </div>
        </div>
        {s.live && (
          <Pill kind={s.paused ? 'primary' : 'outline'} disabled={busy} onClick={() => void save({ paused: !s.paused }, s.paused ? 'Texts resumed' : 'All texts paused')}>
            {s.paused ? 'Resume texts' : 'Pause all texts'}
          </Pill>
        )}
      </section>

      <div className="flex flex-col gap-2">
        <Rollup
          step={1}
          start={!s.live}
          title="Your numbers"
          now={s.live ? `Guests text ${s.sender} · replies that need you go to ${s.adminMobile || 'nobody yet'}` : 'Add your number and your mobile to start (then send yourself a test)'}
        >
          {s.connected === false && (
            <div role="status" className="flex flex-col gap-2 p-3 rounded-[12px] bg-[#fbf3e1] border border-[#ecd9ae] text-[14px]">
              <strong>{s.canBuy ? 'Buy texts first (above) to send texts automatically.' : 'Automatic texts aren’t available on this site yet.'}</strong>
              <span>
                You don’t need texts to start: send every guest their invitation free from your own phone (Guests → More → Text from my own phone), or by email from your wedding’s address. Replies still land in your guest list.
              </span>
            </div>
          )}
          <Label text={`Your ${s.provider} number (guests see this and reply to it)`}>
            <input value={val('sender')} onChange={(e) => edit({ sender: e.target.value })} placeholder="04xx xxx xxx" className={inputCls} />
          </Label>
          <Label text="Your mobile (replies that need you are forwarded here; tests go here)">
            <input value={val('adminMobile')} onChange={(e) => edit({ adminMobile: e.target.value })} placeholder="04xx xxx xxx" className={inputCls} />
          </Label>
          <TestSend wid={wid} hasMobile={!!s.adminMobile} connected={s.connected !== false} />
        </Rollup>

        <Rollup step={2} title="When texts go out" now={`${hourLabel(s.quietStart)} to ${hourLabel(s.quietEnd)} your time · up to ${s.dailyCap} a day · with the opt-out line`}>
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
              <input type="number" min={1} max={5000} value={val('dailyCap')} onChange={(e) => e.target.value !== '' && edit({ dailyCap: Math.max(1, Math.min(5000, Math.round(Number(e.target.value)) || 1)) })} className={inputCls} />
            </Label>
          </div>
          <Label text="Opt-out line added to every text (required by the Spam Act)">
            <input value={val('optOutFooter')} onChange={(e) => edit({ optOutFooter: e.target.value })} className={inputCls} />
          </Label>
        </Rollup>

        <Rollup step={3} title="What it will cost" now={`${(s.rateX100 / 100).toFixed(2)}¢ a text · about ${money(s.planTotalCents)} for everything planned`}>
          <Label text="Price per text, in cents incl. GST">
            <input type="number" step="0.01" min="0" value={val('rateX100') / 100} onChange={(e) => edit({ rateX100: Math.round(Number(e.target.value) * 100) })} className={inputCls} />
          </Label>
          <p className="m-0 text-[13px] text-[var(--adm-muted,#5b6a52)]">
            {s.provider === 'Texto'
              ? 'Texto charges about 3¢ per text part (less in bigger packs; credits last 12 months), plus about $15 a month for the dedicated number guests text back to. Both are counted below.'
              : 'Mobile Message charges 1.6¢ + GST (1.76¢) per text if you buy credits within 30 days of signing up; credits never expire. After that the standard rate is 4¢ + GST. New accounts get 50 free texts for testing.'}
          </p>
          <div className="flex flex-col">
            {s.plan.map((p) => (
              <div key={p.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 py-2 border-t border-[var(--adm-line,#ece3cc)] text-[14px]">
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
        </Rollup>

        <Rollup step={4} title="Automatic replies" now={`When they reply YES: “${s.replies.yes.slice(0, 60)}${s.replies.yes.length > 60 ? '…' : ''}”`}>
          <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">Sent when a guest texts back. {'{first}'}, {'{event}'} and {'{link}'} are filled in for each guest. STOP always unsubscribes them, whatever you write here.</p>
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
        </Rollup>
      </div>

      {dirty && <SaveBar busy={busy} onDiscard={() => setDraft({})} onSave={() => void save(draft)} />}
    </div>
  );
}

/** Settings → Backup: everything about the wedding as one file. */
/**
 * Account → Backup: a backup every day to the couple's linked Google Drive, Dropbox or OneDrive (its
 * Backups folder), back up now, or download one. Everything: guests, replies, texts, seating and its
 * versions, the planner, the party, photos' details. Never passcodes or sign-ins.
 */
export function Backup() {
  const { wid, overview, path } = useAdmin();
  const toast = useToast();
  const [b, setB] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => backupsApi.get(wid).then(setB).catch(() => setB(null)), [wid]);
  useEffect(() => void load(), [load]);
  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      toast(done);
      await load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="flex flex-col gap-4 max-w-[640px]">
      <div className="flex flex-col gap-2 p-4 rounded-[14px] bg-white border border-[var(--adm-line,#e2d7bc)]">
        <strong className="text-[16px] font-semibold">Daily backup</strong>
        {b?.linked ? (
          <>
            <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">
              {b.auto ? `Every day, a full backup goes to the Backups folder in your ${b.linked}.` : `Daily backups to your ${b.linked} are off.`}{' '}
              {b.last ? `Last backup: ${fmtWhen(b.last, tz)}${b.where ? ` to ${b.where}` : ''}.` : 'The first one goes within the next hour.'}
            </p>
            {b.problem && <p role="alert" className="m-0 text-[14px] text-[#7a4a37]">{b.problem}</p>}
            <div className="flex gap-2 flex-wrap">
              <Pill kind="primary" disabled={busy} onClick={() => void run(() => backupsApi.now(wid), `Backed up to your ${b.linked}`)}>
                {busy ? 'Backing up…' : 'Back up now'}
              </Pill>
              <Pill disabled={busy} onClick={() => void run(() => backupsApi.auto(wid, !b.auto), b.auto ? 'Daily backups off' : 'Daily backups on')}>
                {b.auto ? 'Turn off daily backups' : 'Turn on daily backups'}
              </Pill>
            </div>
          </>
        ) : (
          <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">
            Link your Google Drive, Dropbox or OneDrive (under{' '}
            <a href={path('photos')} className="!text-[var(--adm-ink,#33402f)]">
              Photos → Where photos are saved
            </a>
            ) and a full backup goes there every day, filed in a Backups folder.
          </p>
        )}
      </div>
      <p className="m-0 text-[15px] text-[var(--adm-muted,#5b6a52)]">Or download everything about your wedding as one file now: guests, replies, messages, seating, the planner and wording. Keep it somewhere safe.</p>
      <a href={settingsApi.backupUrl(wid)} download className="self-start py-[10px] px-[18px] rounded-full border border-[var(--adm-line,#c6b794)] text-[14px] font-medium no-underline !text-[var(--adm-ink,#33402f)] hover:bg-[var(--adm-tint,#efe7d3)]">
        Download backup
      </a>
    </section>
  );
}

function TestSend({ wid, hasMobile, connected }: { wid: string; hasMobile: boolean; connected: boolean }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <Pill
        disabled={busy || !hasMobile || !connected}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await textsApi.test(wid, 'This is a test from your wedding admin. If you got this, texts are working.');
            toast(r.stopped ? (r.stopped.reason === 'auth' ? 'Not sent: the texting service isn’t connected yet. Choose “Send from my own phone (free)” meanwhile.' : r.stopped.reason === 'credits' ? 'Not sent: the texting account is out of credit.' : `Not sent: ${r.stopped.error}`) : 'Test sent to your mobile');
          } catch (e) {
            toast((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Send a test to my mobile
      </Pill>
      {!connected ? (
        <span className="text-[13px] text-[#7a7466]">Not available until the texting service is connected.</span>
      ) : (
        !hasMobile && <span className="text-[13px] text-[#7a7466]">Save your mobile first.</span>
      )}
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

/**
 * Text credits: texts are never included in a plan, so this says so plainly and shows what's left. "How
 * many guests?" works out the credits needed (or, once the guest list is in, the texts already planned are
 * counted exactly), the price at the rate is shown, and they pay by card for exactly that (Stripe Checkout).
 * Nothing to sign up to and no keys: the credits are added once paid.
 */
function TextCredits({ s, wid }: { s: SettingsData; wid: string }) {
  const toast = useToast();
  const rate = s.rate ?? { centsPerCredit: 8, serviceFeePct: 0, minCredits: 100, maxCredits: 20000, sendCreditsPerGuest: 13, replyCreditsPerGuest: 4, creditsPerGuest: 17 };
  const credits = s.credits ?? 0;
  const planned = Math.max(0, (s.plannedCredits ?? 0) - credits);
  const [guests, setGuests] = useState('');
  const [busy, setBusy] = useState(false);
  const round = (n: number) => Math.min(rate.maxCredits, Math.max(rate.minCredits, Math.ceil(n / 10) * 10));
  const g = Math.max(0, Math.round(Number(guests) || 0));
  // Guests typed: the usual credits per guest. Otherwise the planned texts still to be paid for.
  const need = g ? round(g * rate.creditsPerGuest) : planned ? round(planned) : 0;
  // Same sums as the server (@wp/shared textCreditsCents): credits at the rate, plus the service fee.
  const sub = need * rate.centsPerCredit;
  const fee = Math.ceil((sub * rate.serviceFeePct) / 100);
  const buy = async () => {
    setBusy(true);
    try {
      window.location.assign((await api.buyTexts(wid, need)).url);
    } catch (e) {
      toast((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <section aria-label="Text credits" className="flex flex-col gap-3 p-5 rounded-[14px] border border-[var(--adm-line,#d9cdb0)] bg-[#fbf7ee]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="m-0 font-display text-[22px] font-normal">Text credits</h2>
        <span className="text-[15px]">
          <strong>{credits.toLocaleString('en-AU')}</strong> {credits === 1 ? 'credit' : 'credits'} left
        </span>
      </div>
      <p role="note" className="m-0 p-3 rounded-[10px] bg-white border border-[#ecd9ae] text-[14px] leading-snug">
        <strong>Texts aren’t included in your plan.</strong> {s.costNote ?? ''}
      </p>
      {s.canBuy ? (
        <div className="flex flex-col gap-2">
          <Label text="How many guests will you text? (one text goes to each mobile)">
            <input type="number" inputMode="numeric" min={1} max={3000} value={guests} onChange={(e) => setGuests(e.target.value)} placeholder={planned ? 'Or leave it: we’ve counted your planned texts' : 'e.g. 120'} className={`${inputCls} max-w-[260px]`} />
          </Label>
          {need > 0 && (
            <p className="m-0 text-[14px]" aria-live="polite">
              {g ? `${g} guests × about ${rate.creditsPerGuest} credits each, replies included (about $${((rate.creditsPerGuest * rate.centsPerCredit) / 100).toFixed(2)} a guest)` : 'Your planned texts and replies, less what you have'} = <strong>{need.toLocaleString('en-AU')} credits</strong>. Total{' '}
              <strong>{money(sub + fee)}</strong>, all-in ({rate.centsPerCredit}c a credit{fee ? ` + ${rate.serviceFeePct}% service fee ${money(fee)}` : ''}; GST included).
            </p>
          )}
          <div>
            <Pill kind="primary" disabled={busy || need <= 0} onClick={() => void buy()}>
              {busy ? 'Opening the payment page…' : need > 0 ? `Buy ${need.toLocaleString('en-AU')} credits · ${money(sub + fee)}` : 'Type how many guests'}
            </Pill>
          </div>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">Buying texts isn’t available on this site yet. Send free from your own phone or by email meanwhile.</p>
      )}
      <p className="m-0 text-[13px] text-[var(--adm-muted,#5b6a52)]">
        One credit per text of up to 160 characters (a longer one, with a link, usually uses 2). Credits never expire. When they run out, automatic texts stop until you buy more: nothing is ever charged without you choosing to.
      </p>
    </section>
  );
}
