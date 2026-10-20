import { andList, eventSlotOfPart, fillTags, joinDiet } from '@wp/shared';
import { themeOf } from '../themeKit';
import { playerFor } from '../audio';
import { createElement, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent, type UIEvent } from 'react';
import { SECTION_PARTS } from '../generated/InvitationView.meta';
import type { ViewValues } from '../types';
import { guestApi, GuestApiError, type GuestInvitation, type InvitePayload, type RsvpBody } from './api';
import { shownRows, TIMELINE_ROWS, TimelineRows } from './Timeline';

/**
 * The invitation's behaviour, ported from the design's logic (design/extracted/invitation.html, renderVals).
 * Produces exactly the values the generated view reads. Wording comes from the wedding's catalogue.
 * Timings are the design's: open at 1.5s, card at 2.7s, envelope gone at 4.6s.
 */

const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;
const OL = 'var(--l3,#88a468)', BK = 'var(--acc2,#b59a62)', CR = '#fbf8f2', INK = '#4a3a24';
const SEAL_INK: Record<string, string> = { Sandstone: '#fff3dc', 'Dusty rose': '#fff5f6', 'Daphne blue': '#ffffff' };
const QUEUE = 'wp-rsvp-queue';

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* private mode: not essential */
    }
  },
  del: (k: string) => {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

interface Form {
  w: boolean | null;
  b: boolean | null;
  count: string;
  ride: string;
  diet: string;
  msg: string;
}

function formFrom(g: GuestInvitation | null, data: InvitePayload): Form {
  const [e0, e1] = slots(data);
  const r0 = e0 && g ? g.rsvp[e0.key] : undefined;
  const r1 = e1 && g ? g.rsvp[e1.key] : undefined;
  const rideQ = e1?.questions.find((q) => q.type === 'choice');
  return {
    w: g && e0 && g.invited.includes(e0.key) ? (r0?.attending ?? null) : false,
    b: g && e1 && g.invited.includes(e1.key) ? (r1?.attending ?? null) : false,
    count: String(Math.max(r0?.count ?? 0, r1?.count ?? 0) || (g ? g.people.length : 1)),
    ride: (rideQ && r1?.answers[rideQ.key]) || rideQ?.options?.find((o) => /not sure/i.test(o)) || 'Not sure yet',
    diet: g ? joinDiet(g.people) : '',
    msg: g?.message ?? '',
  };
}

/** "Add to your calendar": the calendar file (Apple, Outlook) and Google, in the section's own colours. */
function calendarLinks(data: InvitePayload, ev: InvitePayload['events'][number]) {
  const start = new Date(ev.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const couple = `${data.wedding.name1.split(' ')[0]} & ${data.wedding.name2.split(' ')[0]}`;
  const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
    action: 'TEMPLATE',
    text: `${couple}: ${ev.name}`,
    dates: `${z(start)}/${z(new Date(start.getTime() + 6 * 3_600_000))}`,
    details: `${window.location.origin}/w/${data.wedding.slug}`,
  }).toString()}`;
  const link = { color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3 };
  // With their own link: all their events in their phone's calendar, kept up to date (a change of time or
  // place reaches it by itself). iPhone and Outlook subscribe to webcal; Android through Google Calendar.
  const token = data.invitation?.token;
  const feed = token ? `webcal://${window.location.host}/api/p/${encodeURIComponent(data.wedding.slug)}/calendar/mine.ics?g=${encodeURIComponent(token)}` : '';
  const android = /android/i.test(navigator.userAgent);
  const subscribe = feed ? (android ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed)}` : feed) : '';
  return createElement(
    'div',
    { style: { fontSize: 15, opacity: 0.85, textAlign: 'center' as const, fontFamily: "'Cormorant Garamond', Georgia, serif" } },
    'Add to your calendar: ',
    createElement('a', { href: `/api/p/${encodeURIComponent(data.wedding.slug)}/calendar/${encodeURIComponent(ev.key)}.ics`, style: link }, 'Apple / Outlook'),
    ' · ',
    createElement('a', { href: google, target: '_blank', rel: 'noopener noreferrer', style: link }, 'Google'),
    ...(subscribe ? [' · ', createElement('a', { href: subscribe, ...(android ? { target: '_blank', rel: 'noopener noreferrer' } : {}), style: link }, 'All my events, kept up to date')] : []),
  );
}

/** The template's two event places: slot 0 (first event) and slot 1 (second event). */
const slots = (d: InvitePayload) => [d.events.find((e) => e.slot === 0), d.events.find((e) => e.slot === 1)] as const;

export function useInvitation(slug: string, data: InvitePayload, preview: boolean) {
  const [guest, setGuest] = useState<GuestInvitation | null>(data.invitation);
  const [p, setP] = useState(0);
  const [muted, setMuted] = useState(false);
  const [form, setForm] = useState<Form>(() => formFrom(data.invitation, data));
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const [lookup, setLookup] = useState('');
  const [lookErr, setLookErr] = useState('');
  const [dressIn, setDressIn] = useState(false);
  const [fanSel, setFanSel] = useState<number | null>(null);
  const [cue, setCue] = useState({ sc: false, end: false, dark: false });
  const [now, setNow] = useState(() => Date.now());
  const [texts] = useState(data.texts);
  const fanTouched = useRef(false);
  const sending = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audio = useRef<{ play: () => void; setMuted: (m: boolean) => void; stop: () => void } | null>(null);
  const scEl = useRef<HTMLElement | null>(null);
  const cueRaf = useRef(0);
  const scrollSave = useRef<ReturnType<typeof setTimeout>>();

  const t = useCallback((k: string) => texts[k] ?? '', [texts]);
  const tx = (k: string, vars: Record<string, string | number> = {}) => fillTags(t(k), vars);
  const [e0, e1] = slots(data);
  const invited = (e: (typeof data.events)[number] | undefined) => !!e && (!guest || guest.invited.includes(e.key));
  const openKey = `wp-inv-opened-${guest?.token ?? 'anon'}`;

  // ---------------------------------------------------------------- theme
  useEffect(() => {
    const th = themeOf(data.wedding.theme, data.content.custom);
    const st = document.documentElement.style;
    Object.entries(th).forEach(([k, val]) => st.setProperty(`--${k}`, val));
    const blush = data.wedding.theme === 'Bridgerton Blush';
    st.setProperty('--pgbg', blush ? '#fbf1f2' : (th.b5 || th.b1 || '#f6f0e2'));
    st.setProperty('--pgbg2', blush ? '#fdf7f6' : (th.b1 || th.iv || '#f6f0e2'));
    document.documentElement.classList.add('pg-inv');
    return () => {
      document.documentElement.classList.remove('pg-inv');
      Object.keys(th).concat(['pgbg', 'pgbg2']).forEach((k) => st.removeProperty(`--${k}`));
    };
  }, [data.wedding.theme, JSON.stringify(data.content.custom ?? {})]); // eslint-disable-line

  // ---------------------------------------------------------------- music (plays once, from the tap)
  useEffect(() => {
    audio.current = playerFor(data.content.audioUrl ?? '');
    return () => audio.current?.stop();
  }, [data.content.audioUrl]);

  // ---------------------------------------------------------------- never show the envelope twice
  useEffect(() => {
    if (preview) {
      // The admin's preview reloads after every save: once opened, it stays open (and where it was) for this visit.
      try {
        if (sessionStorage.getItem(`wp-preview-open-${slug}`)) {
          setP(4);
          setTimeout(() => {
            const el = document.getElementById('inv-scroll');
            const y = Number(sessionStorage.getItem(`${openKey}-y`) ?? 0);
            if (el && y) el.scrollTop = y;
          }, 120);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const o = JSON.parse(store.get(openKey) ?? 'null') as { at: number } | null;
      if (o && Date.now() - o.at < 90 * 864e5) {
        setP(4);
        setTimeout(() => {
          const el = document.getElementById('inv-scroll');
          const y = Number(sessionStorage.getItem(`${openKey}-y`) ?? 0);
          if (el && y) el.scrollTop = y;
        }, 120);
      }
    } catch {
      /* ignore */
    }
  }, [openKey, preview]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    const dress = setTimeout(() => setDressIn(true), 600);
    return () => {
      clearInterval(id);
      clearTimeout(dress);
      timers.current.forEach(clearTimeout);
    };
  }, []);

  // ---------------------------------------------------------------- scroll cue tone over dark sections
  const cueTone = useCallback(() => {
    const el = document.getElementById('inv-cue');
    if (!el || typeof document.elementFromPoint !== 'function') return;
    const r = el.getBoundingClientRect();
    const prev = el.style.pointerEvents;
    el.style.pointerEvents = 'none';
    let n = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) as HTMLElement | null;
    el.style.pointerEvents = prev;
    let dark = false;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if ((cs.backgroundImage && /url\((?!['"]?data:image\/svg)/.test(cs.backgroundImage)) || n.tagName === 'IMG' || n.tagName === 'VIDEO') {
        dark = true;
        break;
      }
      const m = cs.backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
      if (m && (m[4] === undefined || +m[4] > 0.5)) {
        dark = (0.2126 * +m[1]! + 0.7152 * +m[2]! + 0.0722 * +m[3]!) / 255 < 0.55;
        break;
      }
      const g = cs.backgroundImage.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
      if (g && cs.backgroundImage.includes('gradient')) {
        dark = (0.2126 * +g[1]! + 0.7152 * +g[2]! + 0.0722 * +g[3]!) / 255 < 0.55;
        break;
      }
      n = n.parentElement;
    }
    setCue((c) => (c.dark === dark ? c : { ...c, dark }));
  }, []);
  useEffect(() => {
    if (p !== 4) return;
    const first = setTimeout(cueTone, 200);
    // iOS momentum scrolling throttles scroll events, so also sample on a timer (CHANGES 0v).
    const id = setInterval(() => cueTone(), 350);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [p, cueTone]);

  // ---------------------------------------------------------------- offline RSVP queue
  const flushQueue = useCallback(async () => {
    const raw = store.get(QUEUE);
    if (!raw) return;
    try {
      const { slug: s, body } = JSON.parse(raw) as { slug: string; body: RsvpBody };
      const res = await guestApi.rsvp(s, body);
      store.del(QUEUE);
      setGuest(res.invitation);
    } catch {
      /* still offline; try again later */
    }
  }, []);
  useEffect(() => {
    void flushQueue();
    window.addEventListener('online', flushQueue);
    return () => window.removeEventListener('online', flushQueue);
  }, [flushQueue]);

  // ---------------------------------------------------------------- actions
  const phase = useRef(0);
  useEffect(() => {
    phase.current = p;
  }, [p]);
  const open = useCallback(() => {
    if (phase.current > 0) return;
    phase.current = 1;
    if (!preview) store.set(openKey, JSON.stringify({ at: Date.now() }));
    else {
      try {
        sessionStorage.setItem(`wp-preview-open-${slug}`, '1');
      } catch {
        /* this time only */
      }
    }
    audio.current?.play(); // inside the tap, so iOS allows it
    setP(1);
    timers.current.push(setTimeout(() => setP(2), 1500), setTimeout(() => setP(3), 2700), setTimeout(() => setP(4), 4600));
  }, [openKey, preview, slug]);

  async function findGuest() {
    const q = lookup.trim();
    if (!q) return setLookErr(t('inv.dyn.errLookupEmpty'));
    setLookErr(t('inv.dyn.lookupBusy'));
    try {
      const res = await guestApi.find(slug, q);
      setLookErr(res.texted ? tx('inv.dyn.lookupTexted', { ending: res.ending ?? '' }) : t('inv.dyn.lookupNoPhone'));
    } catch (e) {
      setLookErr(e instanceof GuestApiError && e.status === 404 ? t('inv.dyn.lookupMiss') : (e as Error).message);
    }
  }

  async function submit() {
    if (!guest) return setErr(t('inv.dyn.errName'));
    if ((invited(e0) && form.w === null) || (invited(e1) && form.b === null)) return setErr(t('inv.dyn.errAnswer'));
    const rideQ = e1?.questions.find((q) => q.type === 'choice');
    const events: RsvpBody['events'] = {};
    if (e0 && invited(e0) && form.w !== null) events[e0.key] = { attending: form.w };
    if (e1 && invited(e1) && form.b !== null) {
      events[e1.key] = { attending: form.b, ...(rideQ && form.b ? { answers: { [rideQ.key]: form.ride } } : {}) };
    }
    const body: RsvpBody = { token: guest.token, events, count: Number(form.count) || 1, diet: form.diet, message: form.msg };
    if (preview) return setSent(true); // the admin preview never records a reply
    if (sending.current) return; // a double tap on a slow phone sends once
    sending.current = true;
    try {
      const res = await guestApi.rsvp(slug, body);
      setGuest(res.invitation);
      setErr('');
      setSent(true);
    } catch (e) {
      if (e instanceof GuestApiError) return setErr(e.message || t('inv.dyn.sendFailed'));
      // Offline: keep it and send when the phone is back online (CHANGES 0z).
      store.set(QUEUE, JSON.stringify({ slug, body }));
      setErr(t('inv.dyn.queued'));
      setSent(true);
    } finally {
      sending.current = false;
    }
  }

  // ---------------------------------------------------------------- values for the view
  const burst = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2;
        const r = 16 + ((i * 37) % 11);
        return { a, r, size: `${i % 3 ? 5 : 8}px`, c: i % 4 === 0 ? '#fff4d6' : i % 3 === 0 ? '#c9a46a' : '#e7c98c', round: i % 2 };
      }),
    [],
  );
  const petals = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const w = 7 + ((i * 7) % 8);
        return {
          x: `${(i * 41) % 100}%`, w: `${w}px`, h: `${Math.round(w * 1.5)}px`, c: ['#a8b48a', '#e9dcc0', '#c9a46a', '#cdd6b4', '#f4ecdc'][i % 5],
          dur: `${(2.6 + ((i * 13) % 10) / 8).toFixed(2)}s`, del: `${(((i * 17) % 12) / 10).toFixed(2)}s`, sx: `${(i % 2 ? 1 : -1) * (20 + ((i * 9) % 50))}px`,
        };
      }),
    [],
  );

  const names = guest ? guest.people.map((x) => x.name).filter(Boolean) : [];
  const firsts = andList(names.map(first));
  const seal = data.content.seal ?? 'Sandstone';
  const target = Date.parse((e0 ?? e1 ?? data.events[0])?.startsAt ?? '') || now; // birthday-only guests count down to theirs
  const ms = Math.max(0, target - now);
  const p2 = (n: number) => String(n).padStart(2, '0');
  const fanAngles = [-56, -42, -28, -14, 0, 14, 28, 42, 56];
  const fanNames = t('inv.dyn.fanColours').split('|');
  const go = (i: number | null) => {
    fanTouched.current = true;
    setFanSel(i);
  };
  const fan: ViewValues = {};
  for (let i = 0; i < 9; i++) {
    fan[`fan${i}`] = !dressIn ? 'rotate(0deg) scale(.6)' : fanSel === i ? 'translateY(-18px) rotate(0deg) scale(1.22)' : `rotate(${fanAngles[i]}deg)${fanSel !== null ? ' scale(.92)' : ''}`;
    fan[`fz${i}`] = fanSel === i ? 20 : i + 1;
    fan[`fd${i}`] = fanSel !== null || fanTouched.current ? '0s' : `${(i * 0.08).toFixed(2)}s`;
    fan[`pick${i}`] = (e: MouseEvent) => {
      e.stopPropagation();
      go(fanSel === i ? null : i);
    };
    fan[`fc${i}`] = fanSel === i ? '#3e4a6b' : '#5a5470';
    fan[`fw${i}`] = fanSel === i ? 700 : 400;
  }
  const hover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  const cueOn = p >= 4 && cue.sc && !cue.end;
  const greetN = guest ? names.length : 1;
  const greetL = guest ? names.join(', ').length : 10;

  const v: ViewValues = {
    ...fan,
    fanName: fanSel === null ? t('inv.dyn.fanPrompt') : (fanNames[fanSel] ?? ''),
    fanPrev: () => go(fanSel === null ? 8 : (fanSel + 8) % 9),
    fanNext: () => go(fanSel === null ? 0 : (fanSel + 1) % 9),
    fanOp: dressIn ? 1 : 0,
    open,
    onKey: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    },
    onCardScroll: (e: UIEvent<HTMLElement>) => {
      const el = e.currentTarget;
      scEl.current = el;
      clearTimeout(scrollSave.current);
      scrollSave.current = setTimeout(() => {
        try {
          sessionStorage.setItem(`${openKey}-y`, String(Math.round(el.scrollTop)));
        } catch {
          /* ignore */
        }
      }, 250);
      const sc = el.scrollTop > 240;
      const end = el.scrollTop + el.clientHeight >= el.scrollHeight - 140;
      setCue((c) => (c.sc === sc && c.end === end ? c : { ...c, sc, end }));
      if (!cueRaf.current) {
        cueRaf.current = requestAnimationFrame(() => {
          cueRaf.current = 0;
          cueTone();
        });
      }
    },
    cueOp: cueOn ? 1 : 0,
    cuePE: cueOn ? 'auto' : 'none',
    ...(cue.dark
      ? { cueBg: 'rgba(246,240,226,.16)', cueFg: '#f6f0e2', cueBd: 'rgba(246,240,226,.8)' }
      : { cueBg: 'rgba(251,248,242,.88)', cueFg: 'var(--sg,#55633f)', cueBd: 'var(--fgo,#b39563)' }),
    cueClick: (e: MouseEvent) => {
      e.stopPropagation();
      scEl.current?.scrollBy({ top: Math.round(scEl.current.clientHeight * 0.85), behavior: 'smooth' });
    },
    showBar: false,
    previewChips: [],
    scrollDown: (e: MouseEvent) => {
      e.stopPropagation();
      const el = document.querySelector<HTMLElement>('[data-screen-label="01b Countdown"]');
      el?.parentElement?.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' });
    },
    directionsHref: data.content.directionsUrl || '#',
    hasAudio: !!data.content.audioUrl && p >= 3,
    musicIcon: muted ? t('inv.dyn.musicOff') : t('inv.dyn.musicOn'),
    toggleMusic: (e: MouseEvent) => {
      e.stopPropagation();
      audio.current?.setMuted(!muted);
      setMuted(!muted);
    },
    cdD: String(Math.floor(ms / 864e5)),
    cdH: p2(Math.floor(ms / 36e5) % 24),
    cdM: p2(Math.floor(ms / 6e4) % 60),
    cdS: p2(Math.floor(ms / 1e3) % 60),
    lookDisp: guest ? 'none' : 'flex',
    formDisp: guest ? 'flex' : 'none',
    lookup,
    lookErr,
    setLookup: (e: ChangeEvent<HTMLInputElement>) => {
      setLookup(e.target.value);
      setLookErr('');
    },
    lookKey: (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void findGuest();
      }
    },
    findGuest: () => void findGuest(),
    // Someone else on this phone: forget this guest completely (and their link in the address bar).
    notMe: () => {
      setGuest(null);
      setLookup('');
      setLookErr('');
      setErr('');
      setSent(false);
      setForm(formFrom(null, data));
      if (!preview) {
        const u = new URL(window.location.href);
        u.searchParams.delete('g');
        window.history.replaceState(null, '', u);
      }
    },
    welcome: guest ? tx('inv.dyn.welcome', { name: names[0] ?? '' }) : '',
    reserved: guest ? (guest.seatsHeld === 1 ? t('inv.dyn.reservedOne') : tx('inv.dyn.reservedMany', { n: guest.seatsHeld })) : '',
    rideNote: guest ? tx('inv.dyn.rideNoteGuest', { firsts }) : t('inv.dyn.rideNote'),
    greetSize: greetN >= 4 || greetL > 40 ? 'clamp(20px,5.2vw,26px)' : greetN === 3 || greetL > 26 ? 'clamp(23px,6vw,30px)' : 'clamp(28px,7.5vw,36px)',
    rsvpBdayNote: guest && invited(e1) ? t('inv.dyn.secondEventNote') : '',
    greet: guest ? tx('inv.dyn.greet', { names: andList(names, '&') }) : t('inv.dyn.greetAnon'),
    hasGiftAcct: !!(data.content.giftAccount ?? '').trim(),
    giftAcct: (data.content.giftAccount ?? '').trim(),
    giftAcctLabel: data.content.giftAccountLabel || t('inv.dyn.giftLabel'),
    anyYesDisp: form.w === true || form.b === true ? 'flex' : 'none',
    bFaqDisp: guest && !invited(e1) ? 'none' : 'block',
    bSecDisp: guest && !invited(e1) ? 'none' : 'flex',
    rideDisp: guest && invited(e1) && form.b === true ? 'flex' : 'none',
    wDisp: guest && !invited(e0) ? 'none' : 'flex',
    bDisp: guest && !invited(e1) ? 'none' : 'flex',
    countOpts: Array.from({ length: guest ? Math.max(guest.seatsHeld, 1) : 1 }, (_, i) => String(i + 1)),
    noRegistry: !data.content.registryUrl,
    registryHref: data.content.registryUrl || '#',
    cardPE: p >= 3 ? 'auto' : 'none',
    name1: data.wedding.name1,
    name2: data.wedding.name2,
    rsvpBy: data.content.rsvpBy ?? '',
    rideTime: data.content.rideTime ?? '',
    initialsFull: data.content.initials || `${first(data.wedding.name1)} & ${first(data.wedding.name2)}`,
    notSent: !sent,
    sent,
    gCount: form.count,
    gDiet: form.diet,
    gMsg: form.msg,
    gRide: form.ride,
    formError: err,
    setRide: (e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, ride: e.target.value }),
    setCount: (e: ChangeEvent<HTMLSelectElement>) => setForm({ ...form, count: e.target.value }),
    setDiet: (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setForm({ ...form, diet: e.target.value }),
    setMsg: (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => setForm({ ...form, msg: e.target.value }),
    wYes: () => (setForm({ ...form, w: true }), setErr('')),
    wNo: () => (setForm({ ...form, w: false }), setErr('')),
    bYes: () => (setForm({ ...form, b: true }), setErr('')),
    bNo: () => (setForm({ ...form, b: false }), setErr('')),
    wYesBg: form.w === true ? OL : 'transparent', wYesFg: form.w === true ? CR : INK,
    wNoBg: form.w === false ? BK : 'transparent', wNoFg: form.w === false ? CR : INK,
    bYesBg: form.b === true ? OL : 'transparent', bYesFg: form.b === true ? CR : INK,
    bNoBg: form.b === false ? BK : 'transparent', bNoFg: form.b === false ? CR : INK,
    thanks: form.w === false && form.b === false ? t('inv.dyn.thanksNo') : t('inv.dyn.thanksYes'),
    submit: () => void submit(),
    hint: hover ? t('inv.dyn.hintClick') : t('inv.dyn.hintTap'),
    sealPearl: seal === 'Daphne blue',
    sealGold: seal === 'Sandstone',
    sealWine: seal === 'Dusty rose',
    sealInk: SEAL_INK[seal],
    topT: p >= 2 ? 'rotateX(-112deg)' : 'rotateX(0deg)',
    topOp: p >= 2 ? 0 : 1,
    sealT: p >= 2 ? 'translate(-50%,-50%) translateY(-60vh) scale(.9)' : p >= 1 ? 'translate(-50%,-50%) scale(1.08)' : 'translate(-50%,-50%)',
    leafAnim: p >= 1 ? 'leafLit' : 'leafGlow',
    leafM: p >= 1 ? 1 : 0,
    leafIc: '1',
    leafAd: p >= 1 ? '1.6s' : '4s',
    envZoom: p === 1 ? 'scale(.985)' : p >= 2 ? 'scale(1.05)' : 'scale(1)',
    envOp: p >= 4 ? 0 : 1,
    isP1: p === 1,
    isFalling: p >= 2 && p < 4,
    burst: burst.map((b, i) => ({
      size: b.size, m: `-${parseInt(b.size, 10) / 2}px`, c: b.c, r: b.round ? '50%' : '1px',
      t: p >= 1 ? `translate(${(Math.cos(b.a) * b.r).toFixed(1)}vmin,${(Math.sin(b.a) * b.r).toFixed(1)}vmin) rotate(${i * 47}deg) scale(1)` : 'translate(0,0) scale(.2)',
      o: p === 1 ? 1 : 0, d: `${(i % 5) * 0.03}s`, d2: '0s',
    })),
    petals,
    panelOp: p >= 2 ? 0 : 1,
    sealOp: p >= 2 ? 0 : 1,
    leftT: p >= 2 ? 'rotateY(112deg)' : 'rotateY(0deg)',
    rightT: p >= 2 ? 'rotateY(-112deg)' : 'rotateY(0deg)',
    bottomT: p >= 2 ? 'rotateX(112deg)' : 'rotateX(0deg)',
    innerOp: p >= 2 ? 0 : 1,
    hintOp: p === 0 ? 1 : 0,
    envPointer: p >= 2 ? 'none' : 'auto',
    cardOp: p >= 2 ? 1 : 0,
    cardScale: p >= 2 ? 'scale(1)' : 'scale(1.06)',
    textOp: p >= 2 ? 1 : 0,
    textRise: p >= 2 ? 'translateY(0)' : 'translateY(14px)',
    // The couple's photo, or the design's own until they add one (never a broken image).
    image: (id: string) => data.content.images?.[id] || `/seed-media/${id}.jpg`,
    // Admin → Guest pages: sections switched off, and the couple's own accordion lists.
    hide: (label: string) => !!data.content.hidden?.[label],
    list: (key: string) => {
      const items = (data.content.lists?.[key] ?? []).filter((it) => it.q.trim()).map((it) => ({ q: it.q.trim(), a: it.a.map((l) => l.trim()).filter(Boolean) }));
      return items.length ? items : undefined;
    },
    // Admin → Guest pages → Timeline: the couple's own order of events, drawn as the design's rows.
    rows: (key: string) => (key === TIMELINE_ROWS && data.content.timeline && shownRows(data.content.timeline).length ? createElement(TimelineRows, { items: data.content.timeline }) : undefined),
    // The end of an event's own section: "Add to your calendar", and (for the second event) its timeline.
    after: (label: string) => {
      const slot = eventSlotOfPart(SECTION_PARTS[label]) ?? (/^02\b/.test(label) ? 0 : undefined); // "02 …" is the first event's details
      if (slot === undefined) return undefined;
      // By slot, not position: a guest invited only to the second event is sent just that one event.
      const ev = data.events.find((e) => e.slot === slot);
      if (!ev) return undefined;
      const items = slot ? data.content.timelines?.[ev.key] : undefined; // the first event's timeline is the main one
      const timeline = items && shownRows(items).length ? createElement(TimelineRows, { items, onSection: true }) : null;
      // A shuttle for this event: "Book a seat" (for a guest with their own link).
      const token = guest?.token;
      const shuttle =
        ev.shuttles && token
          ? createElement(
              'a',
              {
                href: `/w/${encodeURIComponent(data.wedding.slug)}/shuttle?g=${encodeURIComponent(token)}`,
                style: { alignSelf: 'center', fontSize: 16, color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 3, fontFamily: "'Cormorant Garamond', Georgia, serif" },
              },
              'There’s a shuttle: book your seats',
            )
          : null;
      const party = slot === 0 && guest ? whosWhoBlock(data) : null;
      return createElement('div', { style: { width: '100%', marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 } }, timeline, calendarLinks(data, ev), shuttle, party);
    },
  };
  return {
    v,
    t,
    phase: p,
    /** The guest this page is for now (null after "Not me"): their link drives Message us. */
    guestToken: guest?.token ?? null,
    inParty: !!guest?.party,
    replay: () => {
      phase.current = 0;
      setP(0);
    },
  };
}

/** "Who's who": the wedding party by side (each side's people under its name), then anyone on neither side. */
function whosWhoBlock(data: InvitePayload) {
  const party = data.party;
  if (!party?.people.length) return null;
  const serif = "'Cormorant Garamond', Georgia, serif";
  const groups = [
    { title: party.sides.p1, people: party.people.filter((p) => p.side === 'p1') },
    { title: party.sides.p2, people: party.people.filter((p) => p.side === 'p2') },
    { title: '', people: party.people.filter((p) => !p.side) },
  ].filter((g) => g.people.length);
  return createElement(
    'section',
    { 'aria-label': 'Who’s who', style: { marginTop: 14, textAlign: 'center', fontFamily: serif } },
    createElement('div', { style: { fontSize: 13, letterSpacing: '.28em', textTransform: 'uppercase', fontWeight: 600, fontFamily: "'DM Sans', system-ui, sans-serif", opacity: 0.8 } }, 'Who’s who'),
    createElement(
      'div',
      { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '14px 36px', marginTop: 10 } },
      ...groups.map((g, i) =>
        createElement(
          'div',
          { key: i, style: { minWidth: 160 } },
          g.title ? createElement('div', { style: { fontStyle: 'italic', fontSize: 18, marginBottom: 4 } }, g.title === 'Bride' || g.title === 'Groom' ? `The ${g.title.toLowerCase()}’s side` : g.title) : null,
          ...g.people.map((p, k) =>
            createElement('div', { key: k, style: { fontSize: 17, lineHeight: 1.45 } }, p.name, createElement('span', { style: { opacity: 0.7, fontStyle: 'italic' } }, ` · ${p.role}`)),
          ),
        ),
      ),
    ),
  );
}
