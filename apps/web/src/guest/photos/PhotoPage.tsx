import '@fontsource/cormorant-garamond/400.css';
import { themeOf } from '../themeKit';
import '@fontsource/cormorant-garamond/400-italic.css';
import { fillTags } from '@wp/shared';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PhotoUploadView } from '../generated/PhotoUploadView';
import { GuestMessage } from '../GuestMessage';
import { guestApi, type PhotoEvent, type PhotoPagePayload } from '../invitation/api';
import { assetOf, setPageClass } from '../guide/common';
import { FILTER_LABEL, filterFontsReady, filtersFor, renderPhoto, type FilterInfo, type FilterKey } from './filters';
import { isLook, isVideo, LOOK_KEYS, LOOKS, MAX_VIDEO_MB, type LookKey } from './looks';
import { SnapCam } from './SnapCam';

/**
 * /w/:slug/photos/:event?g=<token>: guests add photos to that event's album (design/Photo Upload.dc.html),
 * from the camera roll or by taking them right here, with the event's filters (names, wax seal, frame,
 * the birthday's number). Each photo is shrunk on the phone (longest side 2400px, JPEG) with its filter
 * drawn on, then sent one at a time; failures can be retried. A link without an event asks which one.
 */

type Status = 'wait' | 'up' | 'ok' | 'err';
interface Item {
  id: string;
  file: Blob;
  url: string;
  st: Status;
  /** Taken with the camera here: the filter is already on it. */
  pre: boolean;
  filter: FilterKey;
  look: LookKey;
}

const NAME_KEY = 'wp-photo-name';
const remembered = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

/**
 * A small copy for the tile once a photo is sent: the full-size original is let go, so adding fifty
 * photos doesn't run a phone out of memory. Falls back to the original if it can't be drawn.
 */
async function thumbOf(file: Blob): Promise<Blob> {
  if (isVideo(file)) return (await videoPoster(file)) ?? file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 360 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.8));
  } catch {
    return file;
  }
}

/** A video's first moment as a picture, for its tile. */
function videoPoster(file: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const u = URL.createObjectURL(file);
    const done = (b: Blob | null) => {
      URL.revokeObjectURL(u);
      resolve(b);
    };
    v.muted = true;
    v.playsInline = true;
    v.preload = 'metadata';
    v.onloadeddata = () => {
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    };
    v.onseeked = () => {
      const k = Math.min(1, 360 / Math.max(v.videoWidth || 1, v.videoHeight || 1));
      const c = document.createElement('canvas');
      c.width = Math.round((v.videoWidth || 360) * k);
      c.height = Math.round((v.videoHeight || 360) * k);
      c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => done(b), 'image/jpeg', 0.8);
    };
    v.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    v.src = u;
  });
}

const first = (s: string) => s.trim().split(/\s+/)[0] ?? '';
const longDate = (iso: string, tz: string | undefined) => {
  try {
    return new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz || 'Australia/Sydney' }).format(new Date(iso));
  } catch {
    return '';
  }
};

export function PhotoPage() {
  const { slug = '', event = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [page, setPage] = useState<PhotoPagePayload | null>(null);
  const [by, setBy] = useState(remembered);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');
  const [cam, setCam] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => setPageClass('ph'), []);
  useEffect(() => {
    setPage(null);
    guestApi
      .photos(slug, token, event)
      .then((p) => {
        setPage(p);
        if (p.name) setBy((cur) => cur || p.name);
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug, token, event]);
  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url)), []);
  useEffect(() => void filterFontsReady(), []);

  // The album this page fills: the one the link names, else the only event.
  const ev: PhotoEvent | null = page?.event ?? (page?.events?.length === 1 ? page.events[0]! : null);
  const info = useMemo<FilterInfo | null>(() => {
    if (!page || !ev) return null;
    const theme: Record<string, string | undefined> = themeOf(page.wedding.theme);
    const couple = `${first(page.wedding.name1)} & ${first(page.wedding.name2)}`;
    return {
      title: ev.name,
      date: longDate(ev.startsAt, page.wedding.timezone),
      couple,
      monogram: page.wedding.monogram?.trim() || `${page.wedding.name1.charAt(0)}&${page.wedding.name2.charAt(0)}`,
      ink: ev.slot === 1 ? (theme.bdtx ?? '#2f3d5c') : (theme.dg ?? '#33402f'),
      gold: theme.acc ?? '#c8a46a',
      slot: ev.slot,
    };
  }, [page, ev]);
  // The couple's choice of frames (no frame is always there) and looks.
  const offered = page?.looks;
  const filters = (info ? filtersFor(info) : (['none'] as FilterKey[])).filter((f) => f === 'none' || !offered?.frames || offered.frames.includes(f));
  const lookKeys = LOOK_KEYS.filter((k) => k === 'original' || !offered?.looks || offered.looks.includes(k));
  const [filter, setFilter] = useState<FilterKey>('none');
  const [look, setLook] = useState<LookKey>('original');
  useEffect(() => {
    const d = page?.looks?.def;
    if (isLook(d)) setLook(d);
  }, [page?.looks?.def]);
  // Videos too, from the camera roll (the design's picker asks for photos only).
  useEffect(() => {
    if (fileRef.current) fileRef.current.accept = 'image/*,video/*';
  });
  useEffect(() => setFilter(filters[1] ?? 'none'), [info?.title]); // eslint-disable-line

  const t = useCallback((k: string) => page?.texts[k] ?? '', [page]);
  const mark = (id: string, st: Status) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, st } : x)));
  const add = (files: Blob[], pre: boolean) => {
    const big = files.filter((f) => isVideo(f) && f.size > MAX_VIDEO_MB * 1024 * 1024);
    const ok = files.filter((f) => !big.includes(f));
    const added = ok.map((file, i) => ({ id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, file, url: URL.createObjectURL(file), st: 'wait' as const, pre, filter, look }));
    setItems((xs) => [...added, ...xs]);
    setErr(big.length ? `${big.length === 1 ? 'That video is' : `${big.length} videos are`} over ${MAX_VIDEO_MB} MB. Try a shorter clip (about a minute).` : '');
    // A video's tile shows its first moment.
    for (const it of added.filter((x) => isVideo(x.file))) {
      void videoPoster(it.file).then((p) => {
        if (!p) return;
        const url = URL.createObjectURL(p);
        setItems((xs) => xs.map((x) => (x.id === it.id && x.st !== 'ok' ? { ...x, url } : x)));
      });
    }
  };

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    for (;;) {
      const it = itemsRef.current.find((x) => x.st === 'wait');
      if (!it) break;
      mark(it.id, 'up');
      itemsRef.current = itemsRef.current.map((x) => (x.id === it.id ? { ...x, st: 'up' } : x));
      try {
        let id = '';
        let sent: Blob = it.file;
        if (isVideo(it.file)) {
          // A video goes as it is; its look is kept with it and shown when it plays.
          id = await guestApi.uploadPhoto(slug, token, by.trim(), it.file, ev?.key ?? '', it.look === 'original' ? '' : it.look);
        } else {
          sent = it.pre ? it.file : await renderPhoto(it.file, it.filter, info, it.look);
          id = await guestApi.uploadPhoto(slug, token, by.trim(), sent, ev?.key ?? '');
        }
        // Sent: swap the full-size original for a small tile copy (and give the album the same small copy).
        const small = await thumbOf(sent);
        if (id && small.type === 'image/jpeg' && small.size <= 120_000) void guestApi.uploadThumb(slug, token, id, small);
        const url = URL.createObjectURL(small);
        URL.revokeObjectURL(it.url);
        setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, st: 'ok', file: small, url } : x)));
        itemsRef.current = itemsRef.current.map((x) => (x.id === it.id ? { ...x, st: 'ok', file: small, url } : x));
      } catch (e) {
        mark(it.id, 'err');
        // Say why (album closed, too large, not a photo, too many at once), not just "Retry".
        setErr((e as Error).message);
      }
    }
    running.current = false;
  }, [slug, token, by, info, ev]);

  useEffect(() => {
    if (items.some((x) => x.st === 'wait')) void run();
  }, [items, run]);

  if (!page) return err ? <GuestMessage message={err} /> : <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;
  if (!ev && (page.events?.length ?? 0) > 1) return <ChooseEvent page={page} slug={slug} token={token} />;

  const ok = items.filter((x) => x.st === 'ok').length;
  const left = items.filter((x) => x.st === 'wait' || x.st === 'up').length;
  const bad = items.filter((x) => x.st === 'err').length;
  const firstName = first(by);
  const ready = () => {
    const problem = !page.open ? t('ph.dyn.closed') : !by.trim() ? t('ph.dyn.needName') : '';
    setErr(problem);
    return !problem;
  };
  const v = {
    asset: assetOf(page.images),
    greeting: firstName ? fillTags(t('ph.dyn.greeting'), { first: firstName }) : t('ph.dyn.greetingAnon'),
    by,
    setBy: (e: ChangeEvent<HTMLInputElement>) => {
      setBy(e.target.value);
      setErr('');
      try {
        localStorage.setItem(NAME_KEY, e.target.value);
      } catch {
        /* not essential */
      }
    },
    fileRef,
    choose: () => {
      if (ready()) fileRef.current?.click();
    },
    chooseLbl: t(items.length ? 'ph.dyn.chooseMore' : 'ph.dyn.choose'),
    pick: (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (files.length) add(files, false);
    },
    hasErr: !!err,
    err,
    hasItems: items.length > 0,
    status: left
      ? left === 1
        ? t('ph.dyn.addingOne')
        : fillTags(t('ph.dyn.addingMany'), { n: left })
      : (ok === 1 ? t('ph.dyn.addedOne') : fillTags(t('ph.dyn.addedMany'), { n: ok })) + (bad ? ` ${fillTags(t('ph.dyn.failed'), { n: bad })}` : ''),
    items: items.map((it) => ({
      url: it.url,
      up: it.st === 'up',
      label: it.st === 'wait' ? t('ph.dyn.waiting') : it.st === 'up' ? '' : it.st === 'ok' ? t('ph.dyn.done') : t('ph.dyn.retry'),
      veil: it.st === 'ok' ? 'linear-gradient(180deg,transparent 60%,rgba(51,64,47,.75))' : it.st === 'err' ? 'rgba(138,90,69,.7)' : 'rgba(51,64,47,.45)',
      imgOp: it.st === 'ok' ? 1 : 0.7,
      cur: it.st === 'err' ? 'pointer' : 'default',
      retry: () => it.st === 'err' && mark(it.id, 'wait'),
    })),
  };
  return (
    <>
      <div className="dz">
        <PhotoUploadView v={v} t={t} />
      </div>
      {page.album && token && (
        <a
          href={`/w/${encodeURIComponent(slug)}/album?g=${encodeURIComponent(token)}`}
          className="fixed z-40 top-[max(14px,env(safe-area-inset-top))] right-4 py-[9px] px-4 rounded-full text-[16px] no-underline shadow-[0_6px_18px_rgba(30,30,30,.2)]"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: info?.ink ?? '#33402f', color: '#fbf8f2' }}
        >
          See everyone’s photos
        </a>
      )}
      {/* The camera and the event's filters, over the design's page. */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) add(files, false);
        }}
      />
      {info && (
        <div
          className="fixed left-0 right-0 bottom-0 z-40 flex flex-col gap-2 items-center pt-3 px-4 pb-[max(14px,env(safe-area-inset-bottom))] bg-[rgba(251,248,242,.96)] border-t border-[#e2d7bc] shadow-[0_-8px_24px_rgba(51,64,47,.12)]"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: info.ink }}
        >
          <div className="text-[13px] tracking-[.18em] uppercase font-semibold opacity-80">{ev?.name} album</div>
          <div role="radiogroup" aria-label="Filter" className="flex gap-2 overflow-x-auto max-w-full [scrollbar-width:none]">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={f === filter}
                onClick={() => setFilter(f)}
                className="flex-none py-[6px] px-4 rounded-full border text-[16px] cursor-pointer"
                style={f === filter ? { background: info.ink, color: '#fbf8f2', borderColor: info.ink } : { background: 'transparent', color: info.ink, borderColor: 'rgba(0,0,0,.18)' }}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Look" className="flex gap-2 overflow-x-auto max-w-full [scrollbar-width:none]">
            {lookKeys.length > 1 && lookKeys.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === look}
                onClick={() => setLook(k)}
                className="flex-none flex items-center gap-2 py-[5px] pl-[5px] pr-3 rounded-full border text-[15px] cursor-pointer"
                style={k === look ? { background: info.ink, color: '#fbf8f2', borderColor: info.ink } : { background: 'transparent', color: info.ink, borderColor: 'rgba(0,0,0,.18)' }}
              >
                {/* A swatch of the look: a little sunset, graded. */}
                <span aria-hidden className="w-[22px] h-[22px] rounded-full" style={{ background: 'linear-gradient(135deg,#f2b880,#c96d6d 55%,#5a6f8f)', filter: LOOKS[k].css }} />
                {LOOKS[k].label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => ready() && setCam(true)}
            className="w-full max-w-[420px] py-3 rounded-full border-0 text-[19px] cursor-pointer"
            style={{ background: info.ink, color: '#fbf8f2' }}
          >
            Take a photo
          </button>
        </div>
      )}
      {cam && info && (
        <SnapCam
          info={info}
          filters={filters}
          filter={filter}
          onFilter={setFilter}
          look={look}
          onShot={(b) => add([b], true)}
          onClose={() => setCam(false)}
          fallback={() => camRef.current?.click()}
        />
      )}
      {/* Room so the bar never covers the page's last lines. */}
      {info && <div aria-hidden className="h-[220px]" />}
    </>
  );
}

/** A link that doesn't name an event: each event has its own album, so ask which. */
function ChooseEvent({ page, slug, token }: { page: PhotoPagePayload; slug: string; token: string }) {
  const theme: Record<string, string | undefined> = themeOf(page.wedding.theme);
  return (
    <main
      className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: theme.iv ?? '#f6f0e2', color: theme.dg ?? '#33402f' }}
    >
      <div className="text-[14px] tracking-[.24em] uppercase font-semibold opacity-80">Share your photos</div>
      <h1 className="m-0 text-[44px] leading-[1.1] font-normal" style={{ fontFamily: "'Pinyon Script', cursive" }}>
        Which celebration?
      </h1>
      <div className="flex flex-col gap-3 w-full max-w-[360px]">
        {(page.events ?? []).map((e) => (
          <Link
            key={e.key}
            to={`/w/${encodeURIComponent(slug)}/photos/${encodeURIComponent(e.key)}${token ? `?g=${encodeURIComponent(token)}` : ''}`}
            className="py-4 px-5 rounded-[14px] no-underline text-[22px] border"
            style={e.slot === 1 ? { background: theme.bdtx ?? '#2f3d5c', color: '#f3ecd6', borderColor: 'transparent' } : { background: '#fbf8f2', color: theme.dg ?? '#33402f', borderColor: theme.gcap ?? '#d3c6a4' }}
          >
            {e.name}
          </Link>
        ))}
      </div>
    </main>
  );
}
