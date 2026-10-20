import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { photoLinksApi, type PhotoLink, type PhotoLinks as Data } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

/**
 * Photos → "Where photos are saved": link your own Google Drive, Google Photos, Dropbox or OneDrive and
 * every guest photo is also saved there, in a folder (or album) per event. For the couple it's one tap
 * (Connect); switching each service on for the site is a one-time job for whoever runs it (super-admins see the steps).
 */

const ICON: Record<PhotoLink['provider'], string> = { gdrive: 'Drive', gphotos: 'Photos', dropbox: 'Dropbox', onedrive: 'OneDrive' };
const ERRORS: Record<string, string> = {
  expired: 'That took too long. Please try linking again.',
  signed_out: 'You were signed out part-way through. Sign in and link again.',
  declined: 'Linking was cancelled.',
  no_offline: 'The account didn’t allow ongoing access. Try again and allow access when asked.',
  failed: 'Linking didn’t work. Please try again.',
};

function Steps({ p, redirect }: { p: PhotoLink['provider']; redirect: string }) {
  const uri = (
    <code className="py-[1px] px-1 rounded bg-white border border-[#e2d7bc] text-[12px] break-all select-all">{redirect}</code>
  );
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
            <>In Google Cloud Console, make a project, then <em>APIs &amp; Services</em> → enable the <em>Google Drive API</em>{p === 'gphotos' ? ' and the Photos Library API' : ''}.</>,
            <>On the <em>OAuth consent screen</em> (Google Auth Platform), choose <em>External</em>, give it your celebration’s name and your email, and add the scope <em>…/auth/drive.file</em>{p === 'gphotos' ? ' (and the Photos Library scope)' : ''}.</>,
            <>Under <em>Audience</em>, choose <em>Publish app</em> (In production). Drive’s “only the files this site makes” access needs no Google review, and in Testing every couple’s link stops working after 7 days.</>,
            <>Under <em>Credentials</em> → <em>Create credentials</em> → <em>OAuth client ID</em> → <em>Web application</em>, add the redirect URI {uri}</>,
            <>Copy the client ID and secret. {secrets('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET')} (One setup covers Google Drive and Google Photos.)</>,
          ];
  return (
    <ol className="m-0 pl-5 flex flex-col gap-[6px] text-[13px] text-[#5b6a52]">
      {list.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ol>
  );
}

export function PhotoLinksPanel({ onChanged }: { onChanged: () => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [others, setOthers] = useState(false);
  const [open, setOpen] = useState<PhotoLink['provider'] | ''>('');

  const load = useCallback(async () => {
    try {
      setD(await photoLinksApi.get(wid));
    } catch {
      /* the album still works without this panel */
    }
  }, [wid]);
  useEffect(() => void load(), [load]);

  // Back from the provider: say how it went, once.
  useEffect(() => {
    const linked = params.get('linked');
    const bad = params.get('link_error');
    if (!linked && !bad) return;
    toast(linked ? 'Connected. Your folders are being made, and every photo is being copied there.' : (ERRORS[bad!] ?? ERRORS.failed!));
    const n = new URLSearchParams(params);
    n.delete('linked');
    n.delete('link_error');
    setParams(n, { replace: true });
    onChanged();
  }, []); // eslint-disable-line

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
  const drive = d.providers.find((p) => p.key === 'gdrive');
  const notReady = d.providers.filter((p) => !p.ready);
  // Google Drive first; the others (and Drive too, once something else is linked) under "somewhere else".
  const elsewhere = d.providers.filter((p) => p.ready && !d.links.some((l) => l.provider === p.key) && (p.key !== 'gdrive' || d.links.length > 0));

  return (
    <section aria-label="Where photos are saved" className="flex flex-col gap-3 p-4 rounded-[14px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
      <div>
        <strong className="font-semibold text-[15px]">Your own Google Drive</strong>
        <p className="m-0 mt-1 text-[13px] text-[var(--adm-muted,#5b6a52)]">
          Connect it once and everything is filed there for you: every guest photo (a folder per event), quotes and contracts, signs, and a backup every day.
          {d.siteStorage ? ' Photos are kept here on the site too.' : ' Until something is connected, guests can’t add photos.'}
        </p>
      </div>

      {d.links.map((l) => (
        <div key={l.id} className={`flex flex-col gap-2 py-3 px-3 rounded-[10px] bg-white border ${l.ok ? 'border-[var(--adm-line,#e2d7bc)]' : 'border-[#c98a70]'}`}>
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[14px]">
              <span aria-hidden className={l.ok ? 'text-[#3d4a2f]' : 'text-[#a4553c]'}>
                {l.ok ? '✓ ' : '⚠ '}
              </span>
              <strong className="font-semibold">{l.ok ? `Connected to ${l.name}` : `${l.name} needs reconnecting`}</strong>
              {l.account ? <span className="text-[var(--adm-muted,#5b6a52)]"> · {l.account}</span> : ''}
            </span>
            {l.ok ? (
              l.openUrl && (
                <a href={l.openUrl} target="_blank" rel="noreferrer" className="text-[13px] underline text-[var(--adm-text,#33402f)]">
                  Open in {l.name} ↗
                </a>
              )
            ) : (
              <Pill kind="primary" size="sm" disabled={!!busy} onClick={() => void connect(l.provider)}>
                {busy === l.provider ? 'Opening…' : 'Reconnect'}
              </Pill>
            )}
          </div>
          {!l.ok && (
            <span className="text-[13px] text-[#7a4a37]">
              {l.name} stopped letting this site in (a changed password, or access removed). Reconnect with the same account and everything carries on where it left off.
            </span>
          )}
          <span className="text-[12px] text-[#7a7466]">
            {l.copied} {l.copied === 1 ? 'photo' : 'photos'} saved there{l.waiting ? ` · ${l.waiting} on the way` : ''}
            {l.failed ? ` · ${l.failed} couldn’t be saved` : ''}
          </span>
          {l.ok && l.problem && <span className="text-[12px] text-[#7a4a37]">{l.problem}</span>}
          {l.provider !== 'gphotos' && <Folders filed={!!l.filed} onSetUp={() => act(() => photoLinksApi.setUpFolders(wid, l.id), `Your folders are ready in ${l.name}`)} />}
          {l.provider !== 'gphotos' && (
            <label className="flex items-center gap-2 text-[13px] cursor-pointer">
              <input
                type="checkbox"
                checked={!!l.docs}
                onChange={(e) => void act(() => photoLinksApi.setDocs(wid, l.id, e.target.checked), e.target.checked ? `Quotes, contracts and menus now go to ${l.name}` : 'Planning files are kept on the site again')}
                className="w-[16px] h-[16px] accent-[#5d6b47]"
              />
              Keep planning files here too (quotes, invoices, contracts, menus)
            </label>
          )}
          <span className="flex gap-4 text-[13px]">
            {l.ok && (l.failed > 0 || l.waiting > 0) && (
              <button type="button" onClick={() => void act(() => photoLinksApi.copyAll(wid, l.id), 'Trying every photo again now.')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[var(--adm-text,#33402f)]">
                Try the rest again
              </button>
            )}
            <button
              type="button"
              onClick={() => window.confirm(`Stop saving to ${l.name}? Everything already there stays there.`) && void act(() => photoLinksApi.remove(wid, l.id), 'Disconnected')}
              className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]"
            >
              Disconnect
            </button>
          </span>
        </div>
      ))}

      {!d.links.length && drive?.ready && (
        <div className="flex flex-col gap-2 py-3 px-3 rounded-[10px] bg-white border border-[var(--adm-line,#e2d7bc)]">
          <ol className="m-0 pl-5 flex flex-col gap-1 text-[13px] text-[var(--adm-muted,#5b6a52)]">
            <li>Tap Connect and choose your Google account.</li>
            <li>Allow access. This site can only see the folder it makes, nothing else in your Drive.</li>
            <li>That’s it: your folders appear in your Drive, and photos start arriving.</li>
          </ol>
          <Pill kind="primary" className="self-start" disabled={!!busy} onClick={() => void connect('gdrive')}>
            {busy === 'gdrive' ? 'Opening Google…' : 'Connect Google Drive'}
          </Pill>
        </div>
      )}
      {!d.links.length && drive && !drive.ready && !d.canSetUp && (
        <p className="m-0 text-[13px] text-[var(--adm-muted,#5b6a52)]">Connecting Google Drive is being switched on for this site.{d.siteStorage ? ' Until then, photos are kept safely here.' : ''}</p>
      )}

      {elsewhere.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" aria-expanded={others} onClick={() => setOthers((x) => !x)} className="self-start p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[var(--adm-muted,#5b6a52)]">
            {d.links.length ? 'Also save somewhere else' : `Use ${elsewhere.map((p) => p.name).join(', ')} instead`}
          </button>
          {others && (
            <div className="flex gap-2 flex-wrap">
              {elsewhere.map((p) => (
                <Pill key={p.key} kind="outline" size="sm" disabled={!!busy} onClick={() => void connect(p.key)}>
                  {busy === p.key ? 'Opening…' : `Connect ${p.name}`}
                </Pill>
              ))}
            </div>
          )}
        </div>
      )}

      {d.canSetUp && notReady.length > 0 && (
        <details className="p-3 rounded-[10px] bg-white border border-dashed border-[var(--adm-line,#c6b794)]">
          <summary className="cursor-pointer text-[13px] font-semibold">Site setup (only you see this): switch on {notReady.map((p) => p.name).join(', ')}</summary>
          <div className="flex gap-2 flex-wrap pt-2">
            {notReady.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-expanded={open === p.key}
                onClick={() => setOpen(open === p.key ? '' : p.key)}
                className={`py-[6px] px-3 rounded-full border text-[13px] cursor-pointer ${open === p.key ? 'bg-[var(--adm-text,#33402f)] text-[#f3ecd6] border-[var(--adm-text,#33402f)]' : 'bg-transparent border-[var(--adm-line,#c6b794)]'}`}
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

/** How the couple's storage is filed, as a little folder tree (and setting it up, for links made before). */
function Folders({ filed, onSetUp }: { filed: boolean; onSetUp: () => Promise<void> }) {
  const { overview } = useAdmin();
  const [busy, setBusy] = useState(false);
  const first = (s = '') => s.split(' ')[0] ?? '';
  const top = `${first(overview?.wedding.name1)} & ${first(overview?.wedding.name2)} wedding`;
  const events = overview?.events.map((e) => e.name) ?? [];
  const row = (name: string, depth: number, note = '') => (
    <li key={`${depth}-${name}`} className="flex items-baseline gap-2" style={{ paddingLeft: depth * 18 }}>
      <span aria-hidden>📁</span>
      <span>{name}</span>
      {note && <span className="text-[12px] text-[#7a7466]">{note}</span>}
    </li>
  );
  return (
    <div className="flex flex-col gap-1 pt-1">
      <ul className="m-0 p-0 list-none text-[13px] flex flex-col gap-[2px]" aria-label="Folders">
        {row(top, 0)}
        {row('Photos', 1)}
        {events.map((e) => row(e, 2))}
        {row('Planning files', 1, 'quotes, contracts, menus')}
        {row('Signs and print', 1)}
        {row('Backups', 1, 'one a day')}
      </ul>
      {!filed && (
        <span className="flex items-center gap-3 flex-wrap text-[13px] text-[#5b6a52]">
          Linked before folders were filed this way: photos already copied stay where they are.
          <Pill
            size="sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSetUp();
              setBusy(false);
            }}
          >
            {busy ? 'Setting up…' : 'Set up these folders'}
          </Pill>
        </span>
      )}
    </div>
  );
}
