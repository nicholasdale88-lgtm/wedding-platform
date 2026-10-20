import { zipSync } from 'fflate';
import { isLook, LOOKS } from '../../guest/photos/looks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { photosApi, type PhotosData } from '../../lib/api';
import { fmtWhen } from '../../lib/format';
import { useAdmin, useSectionName } from '../Shell';
import { chipCls, Disclosure, Eyebrow, Pill, useToast } from '../ui';
import { ChatImport } from './ChatImport';
import { PhotoLinksPanel } from './PhotoLinks';
import { AlbumSharePanel, LiveWallPanel } from './LiveWall';
import { LooksPanel } from './LooksPanel';

/**
 * Admin → Photos (design: isPhotos): the album guests built. Filter by who took them, select and
 * download as one zip, save or remove single photos. Each guest uploads from their own link (on the
 * night-before guide's QR code and in the morning-after text), so there is no public upload page.
 */

const DAY = 86_400_000;
const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/avif': 'avif' };
const ext = (type: string) => EXT[type] ?? 'jpg';

export function Photos() {
  const { wid, overview, event: chosen } = useAdmin();
  const section = useSectionName();
  const toast = useToast();
  const [all, setData] = useState<PhotosData | null>(null);
  // Each event's own album (photos added before albums were split show in every event); Account shows all.
  const one = overview?.events.some((e) => e.key === chosen) ?? false;
  const data = useMemo(() => (all && one ? { ...all, items: all.items.filter((p) => !p.event || p.event === chosen) } : all), [all, one, chosen]);
  const [error, setError] = useState('');
  const [by, setBy] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [zipping, setZipping] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await photosApi.list(wid));
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [wid]);
  useEffect(() => void load(), [load]);
  // New uploads appear by themselves while the tab is open.
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  const people = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data?.items ?? []) m.set(p.by, (m.get(p.by) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  if (error) return <p role="alert" className="text-[#7a4a37]">{error}</p>;
  if (!data) return <div aria-busy="true" className="text-[#5b6a52]">Loading the album…</div>;

  const tz = overview?.wedding.timezone ?? 'Australia/Sydney';
  const slug = overview?.wedding.slug ?? 'wedding';
  const shown = data.items.filter((p) => !by || p.by === by);
  const now = Date.now();

  const zip = async (ids: string[]) => {
    setZipping(true);
    try {
      const files: Record<string, Uint8Array> = {};
      for (const [i, p] of data.items.filter((x) => ids.includes(x.id)).entries()) {
        const res = await fetch(p.url, { credentials: 'same-origin' });
        if (!res.ok) continue;
        files[`${String(i + 1).padStart(3, '0')}-${p.by.replace(/[^\w -]/g, '').trim() || 'guest'}.${ext(p.type)}`] = new Uint8Array(await res.arrayBuffer());
      }
      const blob = new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slug}-photos-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setZipping(false);
    }
  };
  const removeChosen = async () => {
    const ids = [...sel];
    if (!window.confirm(ids.length === 1 ? 'Remove this photo from the album? Guests will no longer see it.' : `Remove these ${ids.length} photos from the album? Guests will no longer see them.`)) return;
    try {
      for (const id of ids) await photosApi.remove(wid, id);
      toast(ids.length === 1 ? 'Photo removed' : `${ids.length} photos removed`);
      setSel(new Set());
      await load();
    } catch (e) {
      toast((e as Error).message);
      await load();
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex justify-between items-end gap-4 flex-wrap">
        <div>
          <Eyebrow>{section} · Photos</Eyebrow>
          <h1 className="m-0 mt-[6px] font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">
            {data.items.length} {data.items.length === 1 ? 'photo' : 'photos'}
            {people.length ? ` from ${people.length} ${people.length === 1 ? 'guest' : 'guests'}` : ''}
          </h1>
          <div className="mt-1 text-[15px] text-[#5b6a52]">Guests add photos from their own link: the QR code on their night-before guide, and the text the morning after.</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Pill onClick={() => void load()}>Refresh</Pill>
          <Pill kind="primary" disabled={!data.items.length || zipping} onClick={() => void zip(data.items.map((p) => p.id))}>
            {zipping ? 'Preparing…' : 'Download all'}
          </Pill>
        </div>
      </header>

      {!data.enabled && (
        <div className="p-5 rounded-[14px] bg-[#f1e7c9] text-[15px]">
          <strong className="font-semibold">Guests can't add photos yet.</strong> Connect your Google Drive, Dropbox or OneDrive in Photo settings below (free): every photo is filed there for you.
        </div>
      )}

      {data.items.length > 0 && (
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] max-w-full">
            <button type="button" aria-pressed={!by} onClick={() => setBy('')} className={chipCls(!by)}>
              Everyone
            </button>
            {people.map(([name, n]) => (
              <button key={name} type="button" aria-pressed={by === name} onClick={() => setBy(name)} className={chipCls(by === name)}>
                {name} · {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tap ✓ on photos to choose some; what you can do with them stays in view at the bottom. */}
      {sel.size > 0 && (
        <div className="sticky bottom-[calc(12px+env(safe-area-inset-bottom))] min-[760px]:bottom-4 z-[12] flex items-center justify-between gap-3 flex-wrap py-3 px-4 rounded-[14px] border border-[#d3c6a4] bg-[#fbf8f2] shadow-[0_8px_24px_rgba(51,64,47,.16)]">
          <span className="text-[14px] font-medium">{sel.size} chosen</span>
          <span className="flex gap-2 flex-wrap">
            <Pill kind="primary" disabled={zipping} onClick={() => void zip([...sel])}>
              Download {sel.size}
            </Pill>
            <Pill kind="danger" onClick={() => void removeChosen()}>
              Remove
            </Pill>
            <Pill onClick={() => setSel(new Set())}>Clear</Pill>
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {shown.map((p) => {
          const on = sel.has(p.id);
          return (
            <figure key={p.id} className="relative m-0 flex flex-col gap-1">
              <a href={p.url} target="_blank" rel="noopener" className="block aspect-square overflow-hidden rounded-[10px] bg-[#efe7d3]">
                {p.type.startsWith('video/') && p.thumb ? (
                  <img src={p.thumb} alt={`Video by ${p.by}`} loading="lazy" className="w-full h-full object-cover" style={{ filter: isLook(p.look) ? LOOKS[p.look].css : undefined }} />
                ) : p.type.startsWith('video/') ? (
                  <video src={`${p.url}#t=0.5`} muted playsInline preload="metadata" aria-label={`Video by ${p.by}`} className="w-full h-full object-cover" style={{ filter: isLook(p.look) ? LOOKS[p.look].css : undefined }} />
                ) : (
                  <img src={p.thumb ?? p.url} alt={`Photo by ${p.by}`} loading="lazy" className="w-full h-full object-cover" />
                )}
              </a>
              <button
                type="button"
                aria-label="Select photo"
                aria-pressed={on}
                onClick={() => setSel((s) => (on ? new Set([...s].filter((x) => x !== p.id)) : new Set([...s, p.id])))}
                className={`absolute top-2 left-2 w-9 h-9 sm:w-[26px] sm:h-[26px] rounded-full border-2 border-[#fbf8f2] cursor-pointer text-[14px] ${on ? 'bg-[var(--adm-accent,#5d6b47)] text-[#fbf8f2]' : 'bg-[rgba(51,64,47,.35)] text-transparent'}`}
              >
                ✓
              </button>
              {now - Date.parse(p.at) < DAY && <span className="absolute top-2 right-2 py-[2px] px-2 rounded-full bg-[#b39563] text-[#fbf8f2] text-[11px] font-semibold">New</span>}
              <figcaption className="flex justify-between gap-2 text-[12px] text-[#5b6a52]">
                <span className="truncate">
                  {p.by} · {fmtWhen(p.at, tz)}
                </span>
                <a href={p.url} download={`photo-${p.id.slice(0, 8)}.${ext(p.type)}`} aria-label={`Save photo by ${p.by}`} className="shrink-0 !text-[var(--adm-ink,#33402f)]">
                  Save
                </a>
              </figcaption>
            </figure>
          );
        })}
      </div>
      {!data.items.length && data.enabled && (
        <div className="text-[15px] text-[#5b6a52]">No photos yet. The QR code is on every night-before guide, and the "share your photos" text goes out the morning after.</div>
      )}

      {/* Set once: where photos are kept, the photo looks, the live wall, sharing the album, WhatsApp import. */}
      <Disclosure title="Photo settings" sub="Storage, looks, live wall, sharing, WhatsApp import" defaultOpen={!data.enabled || !data.items.length}>
        <PhotoLinksPanel onChanged={() => void load()} />
        <LooksPanel />
        <LiveWallPanel />
        <AlbumSharePanel />
        {data.enabled && (
          <ChatImport key={chosen} wid={wid} events={(overview?.events ?? []).map((e) => ({ key: e.key, name: e.name }))} event={one ? chosen : undefined} onDone={() => void load()} />
        )}
      </Disclosure>
    </div>
  );
}
