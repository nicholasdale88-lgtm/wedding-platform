import type { DayoutGuide } from '@wp/shared';
import { useState } from 'react';
import type { GuidePayload } from '../invitation/api';
import type { ViewValues } from '../types';
import { contactHref, cssUrl, first, joinNames, say } from './common';

/**
 * The day-out night-before guide's behaviour, ported from design/Night Before 30th.dc.html
 * (renderVals). "Your plan" follows the guest's answer to the event's question (choiceKey);
 * the packing list remembers its ticks on this phone.
 */

const store = {
  get(k: string): Record<string, true> {
    try {
      return JSON.parse(localStorage.getItem(k) ?? '{}') as Record<string, true>;
    } catch {
      return {};
    }
  },
  set(k: string, v: Record<string, true>) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private mode: ticks last for this visit */
    }
  },
};

export function useGuide30(data: GuidePayload): ViewValues {
  const G = data.guide as DayoutGuide;
  const t = (k: string) => data.texts[k] ?? '';
  const s = say(t);
  const packKey = `wp-packed-${data.event.key}-${data.guest.token}`;
  const [packed, setPacked] = useState<Record<string, true>>(() => store.get(packKey));

  const vars = {
    arriveBy: G.arriveBy ?? '',
    activityTime: G.activityTime ?? '',
    picnicTime: G.picnicTime ?? '',
    picnicWhere: (G.picnicWhere ?? '').toLowerCase(),
  };
  const answer = (G.choiceKey && data.guest.answers[G.choiceKey]) || '';
  const yes = !!G.yesAnswer && answer === G.yesAnswer;
  const unsure = !yes && (!answer || answer === G.unsureAnswer);
  const bring = (G.bring ?? []).filter((b) => b.trim());
  const done = bring.filter((b) => packed[b]).length;
  const names = data.guest.people.map((p) => first(p.name)).filter(Boolean);

  return {
    firsts: joinNames(names, t('g30.dyn.and')) || t('g30.dyn.friend'),
    isType: true,
    hero: cssUrl(G.hero),
    date: G.date ?? '',
    mapUrl: G.mapUrl ?? '',
    bomUrl: G.bomUrl ?? '',
    address: G.address ?? '',
    transport: G.transport ?? '',
    signoff: G.signoff ?? '',
    stats: yes
      ? [
          { k: t('g30.dyn.statArrive'), v: vars.arriveBy },
          { k: t('g30.dyn.statActivity'), v: vars.activityTime },
          { k: t('g30.dyn.statPicnic'), v: vars.picnicTime },
        ]
      : [
          { k: t('g30.dyn.statPicnic'), v: vars.picnicTime },
          { k: t('g30.dyn.statWhere'), v: G.picnicWhere ?? '' },
          { k: t('g30.dyn.statDress'), v: G.dress ?? '' },
        ],
    youTag: t(yes ? 'g30.dyn.tagYes' : unsure ? 'g30.dyn.tagUnsure' : 'g30.dyn.tagNo'),
    youHead: s(yes ? 'g30.dyn.headYes' : 'g30.dyn.headNo', vars),
    youText: s(yes ? 'g30.dyn.textYes' : unsure ? 'g30.dyn.textUnsure' : 'g30.dyn.textNo', vars),
    wx: data.weather
      ? { summary: data.weather.summary, detail: s('g30.dyn.wxTop', { max: data.weather.max }), hours: data.weather.hours }
      : { summary: t('g30.dyn.wxSoon'), detail: '', hours: [] },
    runsheet: G.runsheet ?? [],
    bringRows: bring.map((b) => ({
      label: b,
      tick: packed[b] ? '✓' : '',
      bg: packed[b] ? '#3d5f92' : 'transparent',
      col: packed[b] ? '#7d8aa6' : '#2f3d5c',
      strike: packed[b] ? 'line-through' : 'none',
      toggle: () =>
        setPacked((cur) => {
          const next = { ...cur };
          if (next[b]) delete next[b];
          else next[b] = true;
          store.set(packKey, next);
          return next;
        }),
    })),
    packed: done === bring.length ? t('g30.dyn.packedAll') : s('g30.dyn.packedSome', { done, total: bring.length }),
    contacts: (G.contacts ?? []).map((c) => ({ ...c, tel: contactHref(c.phone) })),
  };
}
