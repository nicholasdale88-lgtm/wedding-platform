import { STRETCHES, tableBox, type ReceptionGuide } from '@wp/shared';
import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import type { GuidePayload } from '../invitation/api';
import type { ViewValues } from '../types';
import { assetOf, contactHref, first, joinNames, say, updatedAt, useReveal, videoOf } from './common';

/**
 * The wedding night-before guide's behaviour, ported from design/Night Before Guide.dc.html
 * (renderVals). Produces exactly the values GuideView reads; wording from the catalogue (gd.*).
 */

const tableLabel = (s: ReturnType<typeof say>, name: string) => (/^\d+$/.test(name) ? s('gd.dyn.seatNumber', { n: name }) : s('gd.dyn.seatNamed', { name }));

export function qrDataUrl(text: string): string {
  if (!text) return '';
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createDataURL(6, 0);
  } catch {
    return '';
  }
}

export function useGuide(data: GuidePayload): ViewValues {
  const G = data.guide as ReceptionGuide;
  const t = (k: string) => data.texts[k] ?? '';
  const s = say(t);
  const rv = useReveal();
  const [openFaq, setOpenFaq] = useState(-1);
  const [openTable, setOpenTable] = useState<string | null>(null);
  const qr = useMemo(() => qrDataUrl(new URL(data.photoUrl, window.location.href).href), [data.photoUrl]);

  const ppl = data.guest.people;
  const names = ppl.map((p) => p.name.trim()).filter(Boolean);
  const firsts = names.map(first);
  const diet = ppl.map((p) => p.diet.trim()).find(Boolean) ?? '';
  const dietOwner = ppl.findIndex((p) => p.diet.trim());
  const tables = data.seating?.tables ?? [];
  const tName = (id: string | null) => tables.find((x) => x.id === id)?.name ?? null;
  const myIds = [...new Set(ppl.map((p) => p.tableId).filter((id): id is string => !!tName(id)))];

  const people = ppl.map((p, i) => {
    const tn = tName(p.tableId);
    const assigned = (
      [
        ['Entrée', p.meals.e],
        ['Main', p.meals.m],
        ['Dessert', p.meals.d],
      ] as const
    )
      .filter(([, m]) => m.trim())
      .map(([c, m]) => `${c}: ${m.trim()}`)
      .join(' · ');
    const mine = !!diet && i === dietOwner;
    return {
      name: p.name,
      seat: tn ? tableLabel(s, tn) : t('gd.dyn.seatTbc'),
      meal: assigned || (mine ? s('gd.dyn.mealMine', { diet }) : t('gd.dyn.mealSet')),
      fg: assigned || mine ? '#7a4a37' : '#5b6a52',
      flip: rv.cards ? 'rotateX(0deg)' : 'rotateX(80deg)',
      op: rv.cards ? 1 : 0,
      delay: `${(0.25 + i * 0.18).toFixed(2)}s`,
    };
  });

  const mateTables = myIds.map((id) => {
    const own = ppl.filter((p) => p.tableId === id).map((p) => p.name);
    const others = data.mates[id] ?? [];
    const open = openTable === id;
    return {
      label: tableLabel(s, tName(id)!),
      count: s('gd.dyn.mateCount', { n: own.length + others.length }),
      names: [...own.map((name) => ({ name, tag: t('gd.dyn.you') })), ...others.map((name) => ({ name, tag: '' }))],
      rows: open ? '1fr' : '0fr',
      rot: open ? '45deg' : '0deg',
      exp: open ? 'true' : 'false',
      toggle: () => setOpenTable(open ? null : id),
    };
  });

  const R: Record<string, string | number> = {};
  for (const k of ['day', 'menu', 'photos', 'travel', 'faq']) {
    R[`${k}O`] = rv[k] ? 1 : 0;
    R[`${k}T`] = rv[k] ? 'none' : 'translateY(26px)';
  }
  R.line = rv.day ? 1 : 0;

  const W = data.weather;
  const cold = W?.hours.some((h) => parseInt(h.temp, 10) < 17);
  const wet = W?.hours.some((h) => Number(h.rain) >= 40);
  const plan = data.seating;

  return {
    asset: assetOf(data.images),
    rv: R,
    date: G.date ?? '',
    arrive: G.arrive ?? '',
    start: G.start ?? '',
    address: G.address ?? '',
    mapUrl: G.mapUrl ?? '',
    parking: G.parking ?? '',
    tableNote: G.tableNote ?? '',
    transport: G.transport ?? '',
    parkDirections: G.parkDirections ?? '',
    photoUrl: data.photoUrl,
    qr,
    hasQr: !!qr,
    firsts: joinNames(firsts, t('gd.dyn.and')) || t('gd.dyn.friend'),
    myTable: myIds.length ? myIds.map((id) => tName(id)).join(' & ') : t('gd.dyn.myTableTbc'),
    reception: (G.runsheet ?? []).find((r) => /reception|dinner/i.test(r.what))?.t ?? '',
    wxSummary: W ? W.summary : t('gd.dyn.wxSoon'),
    wxDetail: W ? s('gd.dyn.wxTop', { max: W.max }) : t('gd.dyn.wxSoonDetail'),
    wxHours: (W?.hours ?? []).map((h) => ({ ...h, rain: s('gd.dyn.wxRain', { n: h.rain }) })),
    wxUpdated: W ? s('gd.dyn.wxUpdated', { time: updatedAt(W, data.wedding.timezone) }) : '',
    wxBom: G.bomUrl ?? '',
    wxTip: t(wet ? 'gd.dyn.wxTipWet' : cold ? 'gd.dyn.wxTipCold' : 'gd.dyn.wxTipMild'),
    ...videoOf(G.parkVideo),
    runsheet: G.runsheet ?? [],
    people,
    mateTables,
    hasMates: mateTables.length > 0,
    dietNotes: diet ? [s('gd.dyn.dietNote', { diet })] : [],
    hasPlan: tables.length > 0 || !!plan?.planImg,
    planImg: plan?.planImg ?? '',
    aspect: plan?.aspect ?? '4 / 3',
    features: (plan?.features ?? []).map((f) => ({ label: (/entr/i.test(f.label) ? '↓ ' : '') + f.label, left: `${f.x}%`, top: `${f.y}%`, w: `${f.w}%`, h: `${f.h}%` })),
    planTables: tables.map((tb) => {
      const mine = myIds.includes(tb.id);
      // Same shapes and proportions as the admin's plan; the guest's own table a little larger.
      const box = tableBox({ shape: tb.shape, dir: tb.dir, len: tb.len || 40 }, plan?.aspect ?? '4 / 3');
      const grow = mine && !STRETCHES(tb.shape) ? 1.3 : 1;
      return {
        rad: box.radius,
        ar: 'auto',
        hh: `${box.h * grow}%`,
        name: tb.name,
        left: `${tb.x}%`,
        top: `${tb.y}%`,
        size: `${box.w * grow}%`,
        mine,
        bg: mine ? '#33402f' : '#fbf8f2',
        fg: mine ? '#f3ecd6' : '#5b6a52',
        bd: mine ? '#b39563' : '#c6b794',
      };
    }),
    menu: (G.menu ?? []).map((m) => ({ course: m.course, a: m.a, b: m.b, hasB: !!m.b?.trim() })),
    faq: (G.faq ?? []).map((f, i) => ({
      q: f.q,
      a: f.a,
      rows: openFaq === i ? '1fr' : '0fr',
      rot: openFaq === i ? '45deg' : '0deg',
      toggle: () => setOpenFaq(openFaq === i ? -1 : i),
    })),
    contacts: (G.contacts ?? []).map((c) => ({ name: c.name, role: c.role, phone: c.phone, tel: contactHref(c.phone) })),
  };
}
