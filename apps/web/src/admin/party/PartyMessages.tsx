import { sideDoc, type PartySide } from '@wp/shared';
import { useEffect, useRef, useState } from 'react';
import { plannerApi, type PartyData } from '../../lib/api';
import { useAdmin } from '../Shell';
import { H2, inputCls, useToast } from '../ui';

/**
 * Wedding party → Personal messages: a note from the two of you to each person (the best man, each groomsman,
 * the maid of honour, each bridesmaid, the MC…), shown at the top of their own page. Kept with their side's
 * planning document, saved when you leave the box.
 */
export function PartyMessages({ d }: { d: PartyData }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const [docs, setDocs] = useState<Record<string, { data: PartySide; version: number }>>({});
  const [draft, setDraft] = useState<Record<string, string>>({});
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const kinds = [...new Set(d.members.map((m) => sideDoc(m.side)))];
  useEffect(() => {
    for (const k of kinds)
      plannerApi
        .doc<PartySide>(wid, k)
        .then((r) => setDocs((x) => ({ ...x, [k]: r })))
        .catch(() => undefined);
  }, [wid, kinds.join()]); // eslint-disable-line
  const save = async (personId: string, side: PartyData['members'][number]['side'], message: string) => {
    const k = sideDoc(side);
    const cur = docsRef.current[k];
    if (!cur || (cur.data.people[personId]?.message ?? '') === message) return;
    const person = { outfit: '', size: '', fitting: '', collected: false, paid: false, gift: '', given: false, notes: '', packed: [], pack: [], ...cur.data.people[personId], message };
    const data = { ...cur.data, people: { ...cur.data.people, [personId]: person } };
    try {
      const r = await plannerApi.saveDoc(wid, k, '', data, cur.version);
      setDocs((x) => ({ ...x, [k]: { data, version: r.version } }));
      toast(message ? 'Message saved: it’s on their page' : 'Message removed');
    } catch (e) {
      toast((e as Error).message);
    }
  };
  if (!d.members.length) return null;
  return (
    <section aria-label="Personal messages" className="flex flex-col gap-3 p-5 rounded-[18px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]">
      <div>
        <H2>Personal messages</H2>
        <p className="m-0 mt-1 text-[14px] text-[var(--adm-muted,#5b6a52)]">A note from the two of you to each person. It’s the first thing on their own page. Leave it empty for none.</p>
      </div>
      {d.members.map((m) => {
        const k = sideDoc(m.side);
        const saved = docs[k]?.data.people[m.personId]?.message ?? '';
        return (
          <label key={m.personId} className="flex flex-col gap-1">
            <span className="text-[14px]">
              <strong className="font-semibold">{m.name}</strong> <span className="text-[var(--adm-muted,#5b6a52)]">· {m.role}</span>
            </span>
            <textarea
              aria-label={`Your message to ${m.name}`}
              rows={2}
              maxLength={1000}
              disabled={!docs[k]}
              value={draft[m.personId] ?? saved}
              placeholder={/best man|maid of honou?r|matron/i.test(m.role) ? `e.g. ${m.name.split(' ')[0]}, we couldn’t do this without you…` : 'A few words from you two (optional)'}
              onChange={(e) => setDraft((x) => ({ ...x, [m.personId]: e.target.value }))}
              onBlur={() => draft[m.personId] !== undefined && void save(m.personId, m.side, draft[m.personId]!.trim())}
              className={`${inputCls} resize-y !text-[16px]`}
            />
          </label>
        );
      })}
    </section>
  );
}
