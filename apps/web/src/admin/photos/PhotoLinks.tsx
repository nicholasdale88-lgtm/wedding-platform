import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { photoLinksApi, type PhotoLink, type PhotoLinks as Data } from '../../lib/api';
import { useAdmin } from '../Shell';
import { Pill, useToast } from '../ui';

/**
 * Photos → "Where photos are saved": link your own Google Drive, Google Photos, Dropbox or OneDrive and
 * every guest photo is also saved there, in a folder (or album) per event. Each needs a one-time app
 * setup on this site (steps under each), then it's one click to link your account.
 */

const ICON: Record<PhotoLink['provider'], string> = { gdrive: 'Drive', gphotos: 'Photos', dropbox: 'Dropbox', onedrive: 'OneDrive' };
const WHERE: Record<PhotoLink['provider'], string> = {
  gdrive: 'A folder called "<your names> photos", with a folder inside for each event.',
  gphotos: 'An album for each event, called "<your names> photos · <event>".',
  dropbox: 'Apps → (this site’s app) → a folder for each event.',
  onedrive: 'Apps → (this site’s app) → a folder for each event.',
};
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
          <>Open the Dropbox App Console (dropbox.com/developers/apps) and choose <em>Create app</em> → <em>Scoped access</em> → <em>App folder</em>. Name it after your wedding.</>,
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
            <>On the <em>OAuth consent screen</em>, choose <em>External</em>, add your own email as a <em>test user</em> (free; no review is needed while it’s in testing for you).</>,
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
    toast(linked ? 'Linked. New photos will be saved there too.' : (ERRORS[bad!] ?? ERRORS.failed!));
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

  return (
    <section aria-label="Where photos are saved" className="flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div>
        <strong className="font-semibold text-[15px]">Where photos are saved</strong>
        <p className="m-0 mt-1 text-[13px] text-[#5b6a52]">
          {d.siteStorage ? 'Photos are kept here on your site. ' : ''}
          Link your own Google Drive, Google Photos, Dropbox or OneDrive and every photo guests add is saved there too, in a folder for each event.
          {!d.siteStorage && ' With nothing linked, guests can’t add photos yet.'}
        </p>
      </div>

      {d.links.map((l) => (
        <div key={l.id} className="flex flex-col gap-1 py-2 px-3 rounded-[10px] bg-white border border-[#e2d7bc]">
          <div className="flex justify-between items-center gap-3 flex-wrap">
            <span className="text-[14px]">
              <strong className="font-semibold">{l.name}</strong>
              {l.account ? ` · ${l.account}` : ''}
              <span className={`ml-2 py-[1px] px-2 rounded-full text-[11px] font-semibold ${l.ok ? 'bg-[#dfe5cc] text-[#3d4a2f]' : 'bg-[#f1e1d6] text-[#7a4a37]'}`}>{l.ok ? 'Linked' : 'Needs you'}</span>
            </span>
            <span className="flex gap-3 text-[13px]">
              <button type="button" onClick={() => void act(() => photoLinksApi.copyAll(wid, l.id), 'Copying every photo there now; big albums finish over the next hour.')} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                {l.ok ? 'Copy existing photos' : 'Try again'}
              </button>
              {!l.ok && (
                <button type="button" onClick={() => void connect(l.provider)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[#33402f]">
                  Connect again
                </button>
              )}
              <button
                type="button"
                onClick={() => window.confirm(`Stop saving photos to ${l.name}? Photos already there stay there.`) && void act(() => photoLinksApi.remove(wid, l.id), 'Unlinked')}
                className="p-0 border-0 bg-transparent underline cursor-pointer text-[#7a4a37]"
              >
                Unlink
              </button>
            </span>
          </div>
          <span className="text-[12px] text-[#7a7466]">
            {l.copied} saved there{l.waiting ? ` · ${l.waiting} on the way` : ''}
            {l.failed ? ` · ${l.failed} couldn’t be saved` : ''} · {WHERE[l.provider]}
          </span>
          {l.problem && <span className="text-[12px] text-[#7a4a37]">{l.problem}</span>}
          {l.provider !== 'gphotos' && (
            <label className="flex items-center gap-2 text-[13px] cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={!!l.docs}
                onChange={(e) => void act(() => photoLinksApi.setDocs(wid, l.id, e.target.checked), e.target.checked ? `Quotes, contracts and menus now go to ${l.name}` : 'Planning files are kept on the site again')}
                className="w-[16px] h-[16px] accent-[#5d6b47]"
              />
              Keep planning files here too (quotes, invoices, contracts, menus), in a “wedding planning” folder
            </label>
          )}
        </div>
      ))}

      <div className="flex gap-2 flex-wrap">
        {d.providers.map((p) =>
          p.ready ? (
            <Pill key={p.key} kind="outline" disabled={!!busy} onClick={() => void connect(p.key)}>
              {busy === p.key ? 'Opening…' : `Link ${p.name}`}
            </Pill>
          ) : (
            <button
              key={p.key}
              type="button"
              aria-expanded={open === p.key}
              onClick={() => setOpen(open === p.key ? '' : p.key)}
              className="py-2 px-[14px] rounded-full border border-dashed border-[#c6b794] bg-transparent text-[13px] text-[#5b6a52] cursor-pointer"
              title={`${p.name} needs a one-time setup first`}
            >
              {ICON[p.key]}: set up first
            </button>
          ),
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2 p-3 rounded-[10px] bg-white border border-[#e2d7bc]">
          <strong className="text-[14px] font-semibold">Setting up {d.providers.find((p) => p.key === open)?.name} (once, free)</strong>
          <Steps p={open} redirect={d.redirectUri} />
          <span className="text-[12px] text-[#7a7466]">Only your own sign-in links your account; this site never sees your password, and can only reach the folder it makes.</span>
        </div>
      )}
    </section>
  );
}
