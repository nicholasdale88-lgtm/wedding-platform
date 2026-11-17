import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { photoLinksApi, type PhotoLink, type PhotoLinks as Data } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

/**
 * Photos → "Where photos are saved". The couple taps Connect Google Drive (or Dropbox), signs in and
 * allows access, and comes back to a finished setup: the "The Yes List – A & B" folder is already made
 * in their storage (Photos per event, Planning files, Signs and print, Backups), a welcome file was saved
 * there to prove it works, and guest photos, planning files and daily backups go there from now on.
 * Switching each service on for the site is a one-time job for whoever runs it (super-admins see the steps).
 */

const ICON: Record<PhotoLink['provider'], string> = { gdrive: 'Drive', gphotos: 'Photos', dropbox: 'Dropbox', onedrive: 'OneDrive' };
const ERRORS: Record<string, string> = {
  expired: 'That took a little too long, so nothing was connected. Please try again.',
  signed_out: 'You were signed out part-way through. Sign in here, then connect again.',
  declined: 'Nothing was connected: access wasn’t allowed. Try again and tap Allow when asked.',
  no_offline: 'Access was only given for a moment, so photos couldn’t keep saving. Try again and allow access when asked.',
  setup: 'You signed in, but we couldn’t make your wedding folder there. Tap Reconnect to try again.',
  failed: 'Connecting didn’t work this time. Please try again.',
};
const btn = 'min-h-[44px] p-0 border-0 bg-transparent underline cursor-pointer text-[14px] inline-flex items-center';

type Back = { ok: true; provider: string } | { ok: false; code: string };

export function PhotoLinksPanel({ onChanged }: { onChanged: () => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<PhotoLink['provider'] | ''>('');
  // Back from signing in: what happened, shown as a card at the top of the panel (not just a toast).
  const [back] = useState<Back | null>(() => {
    const linked = params.get('linked');
    const bad = params.get('link_error');
    return linked ? { ok: true, provider: linked } : bad ? { ok: false, code: bad } : null;
  });
  const [backShown, setBackShown] = useState(!!back);
  const panel = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await photoLinksApi.get(wid);
      setD(data);
      return data;
    } catch {
      return null; /* the album still works without this panel */
    }
  }, [wid]);

  useEffect(() => {
    void (async () => {
      let data = await load();
      // Folders are made before the couple is sent back; a quick second look covers a slow read.
      for (let i = 0; back?.ok && i < 3 && data && !data.links.some((l) => l.provider === back.provider && l.filed && l.verified); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        data = await load();
      }
    })();
  }, [load]); // eslint-disable-line

  // Say how it went once: clear the address, bring the panel into view.
  useEffect(() => {
    if (!back) return;
    const n = new URLSearchParams(params);
    n.delete('linked');
    n.delete('link_error');
    setParams(n, { replace: true });
    onChanged();
  }, []); // eslint-disable-line
  useEffect(() => {
    if (back && d) panel.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [back, !!d]); // eslint-disable-line

  if (!d) return null;
  const connect = async (p: PhotoLink['provider']) => {
    setBusy(p);
    try {
      window.location.assign((await photoLinksApi.connect(wid, p)).url);
    } catch (e) {
      toast((e as Error).message);
      setBusy('');
    }
  };
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast(done);
      await load();
      onChanged();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  // Switched on for the site, Google Drive first. Google Photos is never offered here.
  const offered = d.providers.filter((p) => p.key !== 'gphotos');
  const ready = offered.filter((p) => p.ready).sort((a, b) => Number(b.key === 'gdrive') - Number(a.key === 'gdrive'));
  const notReady = offered.filter((p) => !p.ready);
  const links = d.links;
  const more = ready.filter((p) => !links.some((l) => l.provider === p.key));
  const backLink = back?.ok ? links.find((l) => l.provider === back.provider) : undefined;
  const backName = back?.ok ? (offered.find((p) => p.key === back.provider)?.name ?? 'your storage') : '';

  return (
    <section ref={panel} aria-labelledby="where-photos" className="flex flex-col gap-3 p-4 rounded-[14px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)] scroll-mt-4">
      <div>
        <h3 id="where-photos" className="m-0 font-semibold text-[16px]">
          Where photos are saved
        </h3>
        <p className="m-0 mt-1 text-[14px] text-[var(--adm-muted,#5b6a52)]">
          {links.length
            ? 'Every guest photo is saved in your own wedding folder, with your planning files and a daily backup.'
            : 'Connect your own Google Drive or Dropbox and every guest photo is saved there for you, in a folder for each event, with your planning files and a daily backup.'}
          {d.siteStorage ? ' Photos are kept here on the site too.' : links.some((l) => l.ok) ? '' : ' Guests can add photos once something is connected.'}
        </p>
      </div>

      {back && backShown && (
        <div
          role={back.ok && backLink?.ok !== false ? 'status' : 'alert'}
          className={`flex flex-col gap-1 py-3 px-3 rounded-[10px] border ${back.ok && backLink?.ok !== false ? 'bg-[#eef3e6] border-[#b9c9a3]' : 'bg-[#fbeee8] border-[#c98a70]'}`}
        >
          {back.ok && backLink?.ok !== false ? (
            <>
              <strong className="font-semibold text-[15px]">You’re connected to {backName}</strong>
              <span className="text-[14px]">
                {backLink?.folder ? `Your folder “${backLink.folder}” is ready` : 'Your wedding folder is ready'}
                {backLink?.verified ? ', and we saved a test file in it to check everything works.' : '.'} Photos already taken are being copied there now.
              </span>
            </>
          ) : (
            <>
              <strong className="font-semibold text-[15px]">Not connected yet</strong>
              <span className="text-[14px]">{back.ok ? (backLink?.problem ?? ERRORS.setup) : (ERRORS[back.code] ?? ERRORS.failed)}</span>
            </>
          )}
          <button type="button" onClick={() => setBackShown(false)} className={`${btn} self-start text-[13px] text-[var(--adm-muted,#5b6a52)]`}>
            Dismiss
          </button>
        </div>
      )}

      {links.map((l) =>
        l.ok ? (
          <div key={l.id} className="flex flex-col gap-2 py-3 px-3 rounded-[10px] bg-white border border-[var(--adm-line,#e2d7bc)] min-w-0">
            <div className="flex justify-between items-start gap-x-3 gap-y-1 flex-wrap">
              <span className="flex flex-col min-w-0">
                <span className="inline-flex items-center gap-2 text-[15px]">
                  <span className="py-[2px] px-2 rounded-full bg-[#e3ecd6] text-[#33402f] text-[12px] font-semibold">Connected</span>
                  <strong className="font-semibold">{l.name}</strong>
                </span>
                {l.account && <span className="text-[13px] text-[var(--adm-muted,#5b6a52)] break-all">{l.account}</span>}
              </span>
              {l.openUrl && (
                <a href={l.openUrl} target="_blank" rel="noreferrer" className="min-h-[44px] inline-flex items-center text-[14px] underline text-[var(--adm-text,#33402f)]">
                  Open in {l.name}
                  <span aria-hidden>&nbsp;↗</span>
                </a>
              )}
            </div>
            {l.verified && <span className="text-[13px] text-[#3d4a2f]">✓ Checked: we saved a test file in your folder.</span>}
            <span className="text-[13px] text-[#6f6a5d]">
              {l.copied} {l.copied === 1 ? 'photo' : 'photos'} saved there{l.waiting ? ` · ${l.waiting} on the way` : ''}
              {l.failed ? ` · ${l.failed} couldn’t be saved yet` : ''}
            </span>
            {l.problem && <span className="text-[13px] text-[#7a4a37]">{l.problem}</span>}
            {l.provider !== 'gphotos' && <Folders link={l} onSetUp={() => act(() => photoLinksApi.setUpFolders(wid, l.id), `New photos now go into your wedding folder in ${l.name}`)} />}
            {l.provider !== 'gphotos' && (
              <label className="flex items-center gap-3 min-h-[44px] text-[14px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={!!l.docs}
                  onChange={(e) => void act(() => photoLinksApi.setDocs(wid, l.id, e.target.checked), e.target.checked ? `Quotes, contracts and menus now go to ${l.name}` : 'Planning files are kept on the site instead')}
                  className="w-[20px] h-[20px] accent-[#5d6b47] flex-none"
                />
                Keep planning files here too (quotes, invoices, contracts, menus)
              </label>
            )}
            <span className="flex gap-x-5 flex-wrap">
              {(l.failed > 0 || l.waiting > 0) && (
                <button type="button" onClick={() => void act(() => photoLinksApi.copyAll(wid, l.id), 'Trying every photo again now.')} className={`${btn} text-[var(--adm-text,#33402f)]`}>
                  Try the rest again
                </button>
              )}
              <Disconnect link={l} onGo={() => act(() => photoLinksApi.remove(wid, l.id), `Disconnected from ${l.name}. Everything already there stays there.`)} />
            </span>
          </div>
        ) : (
          // A broken link is loud: one plain reason and one big way to fix it.
          <div key={l.id} role="alert" className="flex flex-col gap-2 py-3 px-3 rounded-[10px] bg-[#fbeee8] border-2 border-[#c98a70] min-w-0">
            <strong className="font-semibold text-[15px] text-[#6b3a28]">{l.name} needs reconnecting</strong>
            {l.account && <span className="text-[13px] text-[#6b3a28] break-all">{l.account}</span>}
            <span className="text-[14px] text-[#5b3324]">{l.problem || `${l.name} stopped letting this site save there (a changed password, or access removed).`}</span>
            <span className="text-[13px] text-[#5b3324]">Until then, new photos can’t be saved there. Reconnect with the same account and everything carries on where it left off.</span>
            <Pill kind="primary" disabled={!!busy} onClick={() => void connect(l.provider)} className="self-stretch sm:self-start min-h-[44px]">
              {busy === l.provider ? 'Opening…' : `Reconnect ${l.name}`}
            </Pill>
            <Disconnect link={l} onGo={() => act(() => photoLinksApi.remove(wid, l.id), `Disconnected from ${l.name}. Everything already there stays there.`)} />
          </div>
        ),
      )}

      {/* Nothing linked yet: each service that's switched on, side by side. Tap, sign in, allow: done. */}
      {!links.length && ready.length > 0 && (
        <div className="flex flex-col gap-3 py-3 px-3 rounded-[10px] bg-white border border-[var(--adm-line,#e2d7bc)]">
          <ol className="m-0 pl-5 flex flex-col gap-1 text-[14px]">
            <li>Tap Connect.</li>
            <li>Sign in and tap Allow.</li>
            <li>You’re done: your wedding folder is made and photos start arriving.</li>
          </ol>
          <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))]">
            {ready.map((p, i) => (
              <Pill key={p.key} kind={i === 0 ? 'primary' : 'outline'} disabled={!!busy} onClick={() => void connect(p.key)} className="min-h-[44px] w-full">
                {busy === p.key ? 'Opening…' : `Connect ${p.name}`}
              </Pill>
            ))}
          </div>
          <span className="text-[13px] text-[#6f6a5d]">This site can only see the folder it makes for you, nothing else in your account.</span>
        </div>
      )}
      {!links.length && !ready.length && !d.canSetUp && (
        <p className="m-0 text-[14px] text-[var(--adm-muted,#5b6a52)]">Connecting Google Drive and Dropbox is being switched on for this site.{d.siteStorage ? ' Until then, photos are kept safely here.' : ''}</p>
      )}

      {links.length > 0 && more.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-[var(--adm-muted,#5b6a52)]">Want a second copy somewhere else?</span>
          <div className="flex gap-2 flex-wrap">
            {more.map((p) => (
              <Pill key={p.key} kind="outline" disabled={!!busy} onClick={() => void connect(p.key)} className="min-h-[44px]">
                {busy === p.key ? 'Opening…' : `Connect ${p.name}`}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {d.canSetUp && notReady.length > 0 && (
        <details className="p-3 rounded-[10px] bg-white border border-dashed border-[var(--adm-line,#c6b794)]">
          <summary className="cursor-pointer text-[13px] font-semibold min-h-[44px] flex items-center">
            Only you see this: {notReady.map((p) => p.name).join(', ')} {notReady.length === 1 ? 'needs' : 'need'} switching on once for the whole site
          </summary>
          <p className="m-0 pt-2 text-[13px] text-[var(--adm-muted,#5b6a52)]">
            Couples will only ever tap Connect, sign in and allow access. Before that works, the site itself has to be registered with each company, once, free (about 10 minutes each). Ask Claude to do it with you, or follow the technical steps below.
          </p>
          <div className="flex gap-2 flex-wrap pt-2">
            {notReady.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-expanded={open === p.key}
                onClick={() => setOpen(open === p.key ? '' : p.key)}
                className={`min-h-[44px] py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${open === p.key ? 'bg-[var(--adm-text,#33402f)] text-[#f3ecd6] border-[var(--adm-text,#33402f)]' : 'bg-transparent border-[var(--adm-line,#c6b794)]'}`}
              >
                {ICON[p.key]}
              </button>
            ))}
          </div>
          {open && (
            <div className="flex flex-col gap-2 pt-2">
              <strong className="text-[14px] font-semibold">Switching on {d.providers.find((p) => p.key === open)?.name} (once, free, about 10 minutes)</strong>
              <Steps p={open} redirect={d.redirectUri} />
              <span className="text-[12px] text-[#7a7466]">Once it’s on, every couple on the site just taps Connect. Nobody else ever sees these steps.</span>
            </div>
          )}
        </details>
      )}
    </section>
  );
}

function Disconnect({ link, onGo }: { link: PhotoLink; onGo: () => void }) {
  return (
    <button
      type="button"
      onClick={() => window.confirm(`Stop saving to ${link.name}? Everything already there stays there.`) && onGo()}
      className={`${btn} self-start text-[#7a4a37]`}
    >
      Disconnect {link.name}
    </button>
  );
}

/** The couple's wedding folder, as a little tree (and moving very old links into it, which is rare). */
function Folders({ link, onSetUp }: { link: PhotoLink; onSetUp: () => Promise<void> }) {
  const { overview } = useAdmin();
  const [busy, setBusy] = useState(false);
  const top = link.folder || (overview ? `The Yes List – ${overview.wedding.name1} & ${overview.wedding.name2}` : 'Your wedding folder');
  const events = overview?.events.map((e) => e.name) ?? [];
  const row = (name: string, depth: number, note = '') => (
    <li key={`${depth}-${name}`} className="flex items-baseline gap-2 min-w-0" style={{ paddingLeft: depth * 16 }}>
      <span aria-hidden className="inline-block flex-none w-[12px] h-[9px] rounded-[2px] bg-[#c9b98f] translate-y-[1px]" />
      <span className="break-words min-w-0">{name}</span>
      {note && <span className="text-[12px] text-[#7a7466]">{note}</span>}
    </li>
  );
  return (
    <div className="flex flex-col gap-1 pt-1">
      <ul className="m-0 p-0 list-none text-[13px] flex flex-col gap-[3px]" aria-label="Your folders">
        {row(top, 0)}
        {row('Photos', 1, events.length ? '' : 'a folder for each event')}
        {events.map((e) => row(e, 2))}
        {row('Planning files', 1, 'quotes, contracts, menus')}
        {row('Signs and print', 1)}
        {row('Backups', 1, 'one a day')}
      </ul>
      {!link.filed && (
        <span className="flex items-center gap-3 flex-wrap text-[13px] text-[var(--adm-muted,#5b6a52)] pt-1">
          This connection is from before wedding folders. Photos saved before stay where they are.
          <Pill
            size="sm"
            kind="outline"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSetUp();
              setBusy(false);
            }}
          >
            {busy ? 'Moving…' : 'Use the wedding folder for new photos'}
          </Pill>
        </span>
      )}
    </div>
  );
}

function Steps({ p, redirect }: { p: PhotoLink['provider']; redirect: string }) {
  const uri = <code className="py-[1px] px-1 rounded bg-white border border-[var(--adm-line,#e2d7bc)] text-[12px] break-all select-all">{redirect}</code>;
  const secrets = (a: string, b: string) => (
    <>
      Add them as the GitHub secrets <code>{a}</code> and <code>{b}</code> (repository → Settings → Secrets and variables → Actions). The next deploy switches it on.
    </>
  );
  const list =
    p === 'dropbox'
      ? [
          <>Open the Dropbox App Console (dropbox.com/developers/apps) and choose <em>Create app</em> → <em>Scoped access</em> → <em>App folder</em>. Name it after your celebration.</>,
          <>On <em>Permissions</em>, tick <em>files.content.write</em>, <em>files.content.read</em> and <em>account_info.read</em>, then Submit.</>,
          <>On <em>Settings</em>, add this redirect URI: {uri}</>,
          <>Copy the <em>App key</em> and <em>App secret</em>. {secrets('DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET')}</>,
        ]
      : p === 'onedrive'
        ? [
            <>In the Azure portal, open <em>App registrations</em> → <em>New registration</em>. Choose “Accounts in any organizational directory and personal Microsoft accounts”.</>,
            <>Redirect URI: <em>Web</em>, {uri}</>,
            <>Under <em>API permissions</em>, add Microsoft Graph delegated <em>Files.ReadWrite.AppFolder</em>, <em>User.Read</em> and <em>offline_access</em>.</>,
            <>Under <em>Certificates &amp; secrets</em>, make a client secret. Copy the <em>Application (client) ID</em> and the secret’s value. {secrets('MS_CLIENT_ID', 'MS_CLIENT_SECRET')}</>,
          ]
        : [
            <>In Google Cloud Console, make a project, then <em>APIs &amp; Services</em> → enable the <em>Google Drive API</em>.</>,
            <>On the <em>OAuth consent screen</em> (Google Auth Platform), choose <em>External</em>, give it your celebration’s name and your email, and add the scope <em>…/auth/drive.file</em>.</>,
            <>Under <em>Audience</em>, choose <em>Publish app</em> (In production). Drive’s “only the files this site makes” access needs no Google review, and in Testing every couple’s link stops working after 7 days.</>,
            <>Under <em>Credentials</em> → <em>Create credentials</em> → <em>OAuth client ID</em> → <em>Web application</em>, add the redirect URI {uri}</>,
            <>Copy the client ID and secret. {secrets('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET')}</>,
          ];
  return (
    <ol className="m-0 pl-5 flex flex-col gap-[6px] text-[13px] text-[var(--adm-muted,#5b6a52)]">
      {list.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ol>
  );
}
