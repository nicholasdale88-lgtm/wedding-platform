import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { fillTags } from '@wp/shared';
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { PhotoUploadView } from '../generated/PhotoUploadView';
import { guestApi, type PhotoPagePayload } from '../invitation/api';
import { setPageClass } from '../guide/common';

/**
 * /w/:slug/photos?g=<token>: guests add their photos (design/Photo Upload.dc.html). Each photo is
 * shrunk on the phone (longest side 2400px, JPEG .88), then sent one at a time; failures can be retried.
 */

type Status = 'wait' | 'up' | 'ok' | 'err';
interface Item {
  id: string;
  file: File;
  url: string;
  st: Status;
}

const NAME_KEY = 'wp-photo-name';
const remembered = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};

export function shrink(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 2400 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.88);
    };
    img.onerror = () => {
      URL.revokeObjectURL(u);
      resolve(file); // a format this browser can't draw (e.g. HEIC): send as it is
    };
    img.src = u;
  });
}

export function PhotoPage() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('g') ?? '';
  const [page, setPage] = useState<PhotoPagePayload | null>(null);
  const [by, setBy] = useState(remembered);
  const [items, setItems] = useState<Item[]>([]);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => setPageClass('ph'), []);
  useEffect(() => {
    guestApi
      .photos(slug, token)
      .then((p) => {
        setPage(p);
        if (p.name) setBy((cur) => cur || p.name);
      })
      .catch((e: Error) => setErr(e.message));
  }, [slug, token]);
  useEffect(() => () => itemsRef.current.forEach((it) => URL.revokeObjectURL(it.url)), []);

  const t = useCallback((k: string) => page?.texts[k] ?? '', [page]);
  const mark = (id: string, st: Status) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, st } : x)));

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    for (;;) {
      const it = itemsRef.current.find((x) => x.st === 'wait');
      if (!it) break;
      mark(it.id, 'up');
      itemsRef.current = itemsRef.current.map((x) => (x.id === it.id ? { ...x, st: 'up' } : x));
      try {
        await guestApi.uploadPhoto(slug, token, by.trim(), await shrink(it.file));
        mark(it.id, 'ok');
      } catch {
        mark(it.id, 'err');
      }
    }
    running.current = false;
  }, [slug, token, by]);

  useEffect(() => {
    if (items.some((x) => x.st === 'wait')) void run();
  }, [items, run]);

  if (!page) return <div className="fixed inset-0 bg-[#f6f0e2]" aria-busy="true" />;

  const ok = items.filter((x) => x.st === 'ok').length;
  const left = items.filter((x) => x.st === 'wait' || x.st === 'up').length;
  const bad = items.filter((x) => x.st === 'err').length;
  const firstName = by.trim().split(/\s+/)[0] ?? '';
  const v = {
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
      if (!page.open) return setErr(t('ph.dyn.closed'));
      if (!by.trim()) return setErr(t('ph.dyn.needName'));
      fileRef.current?.click();
    },
    chooseLbl: t(items.length ? 'ph.dyn.chooseMore' : 'ph.dyn.choose'),
    pick: (e: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = '';
      if (!files.length) return;
      const added = files.map((file, i) => ({ id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`, file, url: URL.createObjectURL(file), st: 'wait' as const }));
      setItems((xs) => [...added, ...xs]);
      setErr('');
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
  return <PhotoUploadView v={v} t={t} />;
}
