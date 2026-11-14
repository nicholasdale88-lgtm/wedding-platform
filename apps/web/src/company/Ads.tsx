import { AD_CTA_LABEL, AD_CTAS, adCopyProblems, type AdDraft, type AdImageId, type AdsSettings, type AdVariant } from '@wp/shared';
import { useCallback, useEffect, useState } from 'react';
import { companyApi, type CompanyAds } from '../lib/api';

/**
 * Promote → Ads: the Ads bot's Facebook and Instagram ads. Bots (and the team) write drafts; only an owner or
 * manager approves one, which puts it live under the daily cap. Once a day the bot pauses ads that spend
 * without bringing sign-ups or sales and reports to the inbox. Stop all is always one tap away.
 */
const btn = 'min-h-[44px] py-[9px] px-4 rounded-[10px] border border-[#e3cfc6] bg-white text-[14px] font-medium cursor-pointer text-[#2a1c26] hover:bg-[#fbf5f0] disabled:opacity-60';
const primary = 'min-h-[44px] py-[9px] px-4 rounded-[10px] border-0 bg-[#3a2532] text-[14px] font-semibold cursor-pointer text-[#fbf8f2] disabled:opacity-60';
const field = 'w-full min-h-[44px] py-2 px-3 rounded-[10px] border border-[#e3cfc6] bg-white text-[15px] text-[#2a1c26]';
const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-AU', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
const STATUS: Record<AdVariant['status'], [string, string]> = {
  draft: ['Draft: waiting for a yes', 'bg-[#f6efe2] text-[#6b5a2a]'],
  live: ['Live', 'bg-[#e4efe2] text-[#2f5a2b]'],
  paused: ['Paused', 'bg-[#f3e6e6] text-[#7a3a3a]'],
  stopped: ['Stopped', 'bg-[#eee] text-[#555]'],
};
const blank: AdDraft = { id: '', name: '', primary: '', headline: '', description: '', image: 'text-feed', cta: 'SIGN_UP' };

export function AdsBot({ onNote }: { onNote: (s: string) => void }) {
  const [ads, setAds] = useState<CompanyAds | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState<AdDraft | null>(null);
  const [caps, setCaps] = useState<AdsSettings | null>(null);

  const load = useCallback(async () => {
    try {
      const a = await companyApi.ads();
      setAds(a);
      setCaps(a.settings);
    } catch (e) {
      setProblem((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setProblem('');
    try {
      await fn();
      onNote(done);
      await load();
      return true;
    } catch (e) {
      setProblem((e as Error).message);
      return false;
    } finally {
      setBusy('');
    }
  };

  if (!ads) return <section className="mb-6 text-[14px] text-[#6d5a63]">{problem || 'Loading the ads…'}</section>;
  const spent = ads.variants.reduce((a, v) => a + v.stats.spendCents, 0);
  const live = ads.variants.filter((v) => v.status === 'live').length;
  const imageOf = (id: AdImageId) => ads.images.find((i) => i.id === id);
  const draftProblems = draft ? adCopyProblems(draft) : [];

  return (
    <section className="mb-8 flex flex-col gap-4" aria-labelledby="ads-bot">
      <div>
        <h2 id="ads-bot" className="m-0 text-[20px] font-semibold text-[#2a1c26]">Ads bot</h2>
        <p className="m-0 mt-1 text-[14px] text-[#6d5a63]">
          Facebook and Instagram ads. A bot or the team writes drafts. Nothing spends until an owner or manager approves one. Every day the bot pauses ads that spend without bringing sign-ups and tells you in Overview.
        </p>
      </div>

      {!ads.connected && (
        <div className="p-4 rounded-[12px] border border-[#e3cfc6] bg-[#fbf5f0] text-[14px] text-[#2a1c26]">
          <b>Connect Meta first.</b> In Meta Business (business.facebook.com): make the ad account, set its <b>account spending limit</b>, then make a system user with the ads permission and generate its token. Paste the token, the ad account number and the Facebook Page number in{' '}
          <a href="#settings" className="underline text-[#3a2532]">
            Settings → Connections
          </a>
          . Still needed: {ads.missing.join(', ')}.
        </div>
      )}

      <div className="flex flex-wrap gap-3 items-center text-[14px] text-[#2a1c26]">
        <span>
          <b>{dollars(spent)}</b> spent of {dollars(ads.settings.totalCapCents)} · {dollars(ads.settings.dailyCapCents)} a day · {live} live
        </span>
        {ads.stoppedAll && <span className="py-1 px-2 rounded-[8px] bg-[#f3e6e6] text-[#7a3a3a]">All stopped</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => setDraft({ ...blank })} disabled={!!draft}>
          Write a draft
        </button>
        {ads.connected && (
          <button type="button" className={btn} disabled={!!busy} onClick={() => act('run', () => companyApi.adsAll('run'), 'Checked the ads')}>
            {busy === 'run' ? 'Checking…' : 'Check now'}
          </button>
        )}
        {ads.connected && !ads.stoppedAll && ads.campaignId && (
          <button type="button" className={btn} disabled={!!busy} onClick={() => act('stop', () => companyApi.adsAll('stop-all'), 'All ads stopped')}>
            Stop all ads
          </button>
        )}
        {ads.connected && ads.stoppedAll && ads.canSpend && (
          <button type="button" className={btn} disabled={!!busy} onClick={() => act('start', () => companyApi.adsAll('start-all'), 'Ads started again')}>
            Start the ads again
          </button>
        )}
      </div>
      {problem && (
        <p role="alert" className="m-0 text-[14px] text-[#9a2f2f]">
          {problem}
        </p>
      )}

      {draft && (
        <form
          className="flex flex-col gap-3 p-4 rounded-[12px] border border-[#e3cfc6] bg-white"
          onSubmit={(e) => {
            e.preventDefault();
            void act('draft', () => companyApi.saveAdDraft(draft), 'Draft saved').then((ok) => ok && setDraft(null));
          }}
        >
          <label className="flex flex-col gap-1 text-[14px]">
            Name (for you)
            <input className={field} value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="RSVPs by text, March" />
          </label>
          <label className="flex flex-col gap-1 text-[14px]">
            Short link name (letters, numbers, dashes: it counts this ad’s sign-ups)
            <input className={field} value={draft.id} maxLength={24} onChange={(e) => setDraft({ ...draft, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="text-mar" />
          </label>
          <label className="flex flex-col gap-1 text-[14px]">
            Main words ({draft.primary.length}/125)
            <textarea className={`${field} min-h-[88px]`} value={draft.primary} maxLength={125} onChange={(e) => setDraft({ ...draft, primary: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[14px]">
            Headline ({draft.headline.length}/40)
            <input className={field} value={draft.headline} maxLength={40} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[14px]">
            Line under the headline ({draft.description.length}/30, optional)
            <input className={field} value={draft.description} maxLength={30} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </label>
          <fieldset className="border-0 p-0 m-0">
            <legend className="text-[14px] mb-1">Picture</legend>
            <div className="grid grid-cols-3 gap-2">
              {ads.images.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  aria-pressed={draft.image === i.id}
                  onClick={() => setDraft({ ...draft, image: i.id as AdImageId })}
                  className={`p-1 rounded-[10px] border-2 bg-white cursor-pointer ${draft.image === i.id ? 'border-[#3a2532]' : 'border-transparent'}`}
                >
                  <img src={i.file} alt={i.label} className="w-full h-auto rounded-[6px]" loading="lazy" />
                </button>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-[14px]">
            Button
            <select className={field} value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value as AdDraft['cta'] })}>
              {AD_CTAS.map((c) => (
                <option key={c} value={c}>
                  {AD_CTA_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          {draftProblems.length > 0 && (
            <ul className="m-0 pl-5 text-[14px] text-[#9a2f2f]">
              {draftProblems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <button type="submit" className={primary} disabled={busy === 'draft' || draftProblems.length > 0}>
              Save the draft
            </button>
            <button type="button" className={btn} onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="m-0 p-0 list-none flex flex-col gap-3">
        {ads.variants.length === 0 && <li className="text-[14px] text-[#6d5a63]">No ads yet. Write a draft, or give a bot the Marketing role and it will write some (docs/GROK_PLAYBOOK.md).</li>}
        {[...ads.variants].reverse().map((v) => {
          const img = imageOf(v.image);
          const [label, tone] = STATUS[v.status];
          return (
            <li key={v.id} className="flex gap-3 p-3 rounded-[12px] border border-[#ecdcd3] bg-white">
              {img && <img src={img.file} alt="" className="w-[72px] h-auto self-start rounded-[6px]" loading="lazy" />}
              <div className="flex-1 min-w-0 flex flex-col gap-1 text-[14px] text-[#2a1c26]">
                <div className="flex flex-wrap gap-2 items-center">
                  <b>{v.name}</b>
                  <span className={`py-[2px] px-2 rounded-[8px] text-[13px] ${tone}`}>{label}</span>
                </div>
                <p className="m-0">{v.primary}</p>
                <p className="m-0 font-semibold">{v.headline}</p>
                {v.metaAdId && (
                  <p className="m-0 text-[#6d5a63]">
                    {dollars(v.stats.spendCents)} spent · {v.stats.clicks} clicks · {v.stats.signups} sign-ups · {v.stats.paid} paid
                    {v.stats.paid ? ` · ${dollars(Math.round(v.stats.spendCents / v.stats.paid))} a sale` : ''}
                  </p>
                )}
                {v.why && <p className="m-0 text-[#7a3a3a]">{v.why}</p>}
                <p className="m-0 text-[13px] text-[#6d5a63]">
                  Written by {v.by || 'someone'}
                  {v.approvedBy ? ` · approved by ${v.approvedBy}` : ''}
                </p>
                <div className="flex flex-wrap gap-2 mt-1">
                  {v.status === 'draft' && ads.canSpend && (
                    <button type="button" className={primary} disabled={!!busy || !ads.connected} onClick={() => act(v.id, () => companyApi.adAction(v.id, 'approve'), `“${v.name}” is live`)}>
                      {busy === v.id ? 'Putting it live…' : 'Approve: put it live'}
                    </button>
                  )}
                  {v.status === 'draft' && (
                    <>
                      <button type="button" className={btn} onClick={() => setDraft({ id: v.id, name: v.name, primary: v.primary, headline: v.headline, description: v.description, image: v.image, cta: v.cta })}>
                        Change
                      </button>
                      <button type="button" className={btn} disabled={!!busy} onClick={() => act(v.id, () => companyApi.removeAdDraft(v.id), 'Draft removed')}>
                        Remove
                      </button>
                    </>
                  )}
                  {v.status === 'live' && (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => act(v.id, () => companyApi.adAction(v.id, 'pause'), 'Ad paused')}>
                      Pause
                    </button>
                  )}
                  {v.status === 'paused' && ads.canSpend && (
                    <button type="button" className={btn} disabled={!!busy} onClick={() => act(v.id, () => companyApi.adAction(v.id, 'resume'), 'Ad started again')}>
                      Start again
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {caps && (
        <details className="p-3 rounded-[12px] border border-[#ecdcd3] bg-white text-[14px]">
          <summary className="cursor-pointer min-h-[44px] flex items-center font-semibold">Caps and audience</summary>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {(
              [
                ['dailyCapCents', 'Most a day ($)', true],
                ['totalCapCents', 'Stop everything at ($)', true],
                ['pauseNoSignupCents', 'Pause an ad after ($) with no sign-ups', true],
                ['pauseCostPerSaleCents', 'Pause an ad above ($) a sale', true],
                ['ageMin', 'Youngest', false],
                ['ageMax', 'Oldest', false],
              ] as const
            ).map(([k, label, isMoney]) => (
              <label key={k} className="flex flex-col gap-1">
                {label}
                <input
                  className={field}
                  type="number"
                  inputMode="decimal"
                  disabled={!ads.canSpend}
                  value={isMoney ? caps[k] / 100 : caps[k]}
                  onChange={(e) => setCaps({ ...caps, [k]: Math.round(Number(e.target.value || 0) * (isMoney ? 100 : 1)) })}
                />
              </label>
            ))}
          </div>
          {ads.canSpend ? (
            <button type="button" className={`${primary} mt-3`} disabled={!!busy} onClick={() => act('caps', () => companyApi.saveAdsSettings(caps), 'Caps saved')}>
              Save the caps
            </button>
          ) : (
            <p className="m-0 mt-2 text-[#6d5a63]">Only an owner or manager can change what the ads spend.</p>
          )}
        </details>
      )}

      {ads.log.length > 0 && (
        <details className="text-[14px] text-[#2a1c26]">
          <summary className="cursor-pointer min-h-[44px] flex items-center">What the bot did</summary>
          <ul className="m-0 pl-5">
            {ads.log.slice(0, 15).map((l) => (
              <li key={l.at + l.text}>
                {new Date(l.at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}: {l.text}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
