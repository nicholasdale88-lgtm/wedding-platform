import {
  AU_STATES,
  BDM_LINKS,
  CEREMONY_ORDER,
  GETTING_TO_KNOW_YOU,
  NOIM_FORM_URL,
  dateIn,
  noimStatus,
  paperworkProgress,
  questionnaireProgress,
  type Ceremony as CeremonyDoc,
  type CeremonyFile,
  type CeremonyQuestion,
  type PaperItem,
  type Paperwork as PaperworkDoc,
  type Questionnaire,
} from '@wp/shared';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { plannerApi } from '../../lib/api';
import { shrinkFile } from '../../lib/shrinkFile';
import { Ring } from '../checklists/PhasedChecklist';
import { useUnsavedChanges } from '../leave';
import { useAdmin } from '../Shell';
import { Chips, H2, inputCls, Label, Pill, useToast } from '../ui';
import { useLiveDoc } from './useDocSave';

type P = 'p1' | 'p2';
const newId = () => crypto.randomUUID().slice(0, 10);
const nice = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const card = 'flex flex-col gap-3 p-4 rounded-[16px] border border-[var(--adm-line,#e2d7bc)] bg-[var(--adm-card,#fbf8f0)]';
const small = 'text-[13px] text-[var(--adm-muted,#5b6a52)]';
const tick = 'w-[20px] h-[20px] accent-[#5d6b47] flex-none';

type People = Awaited<ReturnType<typeof plannerApi.ceremonyPeople>>;
type Tab = 'questions' | 'paperwork' | 'ceremony';

/**
 * Wedding planner → Ceremony: the couple and their celebrant work together here. The celebrant's
 * questionnaires (a file, or questions each partner answers in the app), the legal paperwork for an
 * Australian marriage, and the ceremony itself. The celebrant (a helper whose relation is celebrant) can
 * change it even as a viewer.
 */
export function Ceremony() {
  const { wid, overview } = useAdmin();
  const toast = useToast();
  const live = useLiveDoc<CeremonyDoc>(wid, 'ceremony', '', toast);
  useUnsavedChanges(live.pending);
  const [people, setPeople] = useState<People | null>(null);
  const [tab, setTab] = useState<Tab>('questions');
  useEffect(() => {
    plannerApi
      .ceremonyPeople(wid)
      .then(setPeople)
      .catch(() => setPeople(null));
  }, [wid]);
  if (live.error) return <p role="alert" className="text-[#7a4a37]">{live.error}</p>;
  if (!live.doc) return <div aria-busy="true" className="text-[var(--adm-muted,#5b6a52)]">Loading the ceremony…</div>;

  const doc = live.doc.data;
  const first = (n: string | undefined, fallback: string) => n?.trim().split(/\s+/)[0] || fallback;
  const names: Record<P, string> = { p1: first(overview?.wedding.name1, 'Partner 1'), p2: first(overview?.wedding.name2, 'Partner 2') };
  const canEdit = !people || people.role !== 'viewer' || people.relation === 'celebrant';
  const put = (patch: Partial<CeremonyDoc>, now = false) => live.set({ ...doc, ...patch }, now);
  const ev = overview?.events[0];
  const tz = overview?.wedding.timezone;
  const weddingDay = ev ? dateIn(tz, new Date(ev.startsAt)) : '';
  const papers = paperworkProgress(doc.paperwork);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div>
          <H2>Your ceremony</H2>
          <div className={small}>
            {people?.relation === 'celebrant' ? 'Everything for this couple’s ceremony: send your questionnaires, check the paperwork, shape the order.' : 'Work on it with your celebrant: their questionnaires, the legal paperwork, and the order of the ceremony.'}
          </div>
        </div>
        <Ring done={papers.done} total={papers.total} size={52} label="Paperwork done" />
      </div>
      <Chips<Tab>
        label="Ceremony"
        items={[
          { key: 'questions', label: 'Questionnaires' },
          { key: 'paperwork', label: 'Legal paperwork' },
          { key: 'ceremony', label: 'The ceremony' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {!canEdit && <p className={`m-0 ${small}`}>You can look, but not change things here.</p>}
      <fieldset disabled={!canEdit} className="m-0 p-0 border-0 min-w-0 flex flex-col gap-4">
        {tab === 'questions' ? (
          <Questionnaires list={doc.questionnaires} names={names} onChange={(questionnaires, now) => put({ questionnaires }, now)} update={(fn) => live.update((d) => ({ ...d, questionnaires: fn(d.questionnaires) }), true)} />
        ) : tab === 'paperwork' ? (
          <Paperwork p={doc.paperwork} names={names} weddingDay={weddingDay} today={dateIn(tz)} onChange={(paperwork, now) => put({ paperwork }, now)} update={(fn) => live.update((d) => ({ ...d, paperwork: fn(d.paperwork) }), true)} />
        ) : (
          <TheCeremony doc={doc} names={names} me={people?.me ?? ''} celebrants={people?.celebrants ?? []} startsAt={ev?.startsAt ?? ''} tz={tz} put={put} />
        )}
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------- files

const WORD = ['application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', ...WORD];
const byExt: Record<string, string> = { pdf: 'application/pdf', doc: WORD[0]!, docx: WORD[1]!, jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic' };

/** Attach a file (PDF, Word or a photo, up to 1.5 MB): filed with the wedding's planning files. */
function Attach({ file, label, onFiled }: { file: CeremonyFile | null; label: string; onFiled: (f: CeremonyFile) => void }) {
  const { wid } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const take = async (picked: File | undefined) => {
    if (!picked) return;
    setProblem('');
    // Some computers don't say what a Word file is: go by its name.
    const type = picked.type || byExt[picked.name.split('.').pop()?.toLowerCase() ?? ''] || '';
    if (!TYPES.includes(type)) return setProblem('Choose a PDF, a Word document or a photo.');
    setBusy(true);
    try {
      const f = await shrinkFile(type === picked.type ? picked : new File([picked], picked.name, { type }));
      if (f.size > 1_500_000) return setProblem(`That file is ${(f.size / 1_000_000).toFixed(1)} MB: the limit is 1.5 MB. Try saving it as a smaller PDF.`);
      const r = await plannerApi.uploadFile(wid, f);
      onFiled({ id: r.id, name: r.name });
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-2 flex-wrap">
        {file && (
          <a href={plannerApi.fileUrl(wid, file.id)} target="_blank" rel="noopener" className="text-[14px] !text-[var(--adm-ink,#33402f)] underline break-all">
            {file.name}
          </a>
        )}
        <Pill size="sm" kind="outline" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>
          {busy ? 'Filing it…' : file ? 'Replace' : label}
        </Pill>
      </span>
      <input ref={input} type="file" hidden accept={`${TYPES.join(',')},.doc,.docx`} onChange={(e) => void take(e.target.files?.[0])} />
      {problem && (
        <span role="alert" className="text-[13px] text-[#7a4a37]">
          {problem}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------- questionnaires

function Questionnaires({ list, names, onChange, update }: { list: Questionnaire[]; names: Record<P, string>; onChange: (l: Questionnaire[], now?: boolean) => void; update: (fn: (l: Questionnaire[]) => Questionnaire[]) => void }) {
  const today = dateIn(undefined);
  const blank = (title: string, questions: Omit<CeremonyQuestion, 'id'>[]): Questionnaire => ({
    id: newId(),
    title,
    note: '',
    file: null,
    returned: [],
    questions: questions.map((q) => ({ ...q, id: newId() })),
    answers: { p1: {}, p2: {} },
    ready: { p1: false, p2: false },
    added: today,
  });
  const set = (id: string, patch: Partial<Questionnaire>, now = false) => onChange(list.map((q) => (q.id === id ? { ...q, ...patch } : q)), now);
  const change = (id: string, fn: (q: Questionnaire) => Questionnaire) => update((l) => l.map((q) => (q.id === id ? fn(q) : q)));
  return (
    <div className="flex flex-col gap-4">
      <p className={`m-0 ${small}`}>
        Your celebrant’s questions help them tell your story. They can send a questionnaire as a file (fill it in and send your copy back), or ask the questions here. You each answer on your own, then mark yours ready for the celebrant.
      </p>
      {list.map((q) => (
        <QuestionnaireCard key={q.id} q={q} names={names} set={(patch, now) => set(q.id, patch, now)} change={(fn) => change(q.id, fn)} remove={() => window.confirm(`Remove “${q.title}” and its answers?`) && onChange(list.filter((x) => x.id !== q.id), true)} />
      ))}
      <div className="flex gap-2 flex-wrap">
        {!list.some((q) => q.title === 'Getting to know you') && (
          <Pill kind="primary" onClick={() => onChange([...list, blank('Getting to know you', GETTING_TO_KNOW_YOU)], true)}>
            Start with “Getting to know you”
          </Pill>
        )}
        <Pill kind="outline" onClick={() => onChange([...list, blank('Questions from your celebrant', [])], true)}>
          + A new questionnaire
        </Pill>
      </div>
    </div>
  );
}

function QuestionnaireCard({ q, names, set, change, remove }: { q: Questionnaire; names: Record<P, string>; set: (patch: Partial<Questionnaire>, now?: boolean) => void; change: (fn: (q: Questionnaire) => Questionnaire) => void; remove: () => void }) {
  const [who, setWho] = useState<P>('p1');
  const [editing, setEditing] = useState(!q.questions.length && !q.file);
  const prog = questionnaireProgress(q);
  const setQ = (id: string, patch: Partial<CeremonyQuestion>) => set({ questions: q.questions.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const answer = (id: string, text: string) => set({ answers: { ...q.answers, [who]: { ...q.answers[who], [id]: text } }, ready: { ...q.ready, [who]: false } });
  return (
    <section aria-label={q.title} className={card}>
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <input aria-label="Questionnaire name" value={q.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} className="flex-1 min-w-[200px] bg-transparent border-0 p-0 font-display text-[22px]" />
        <span className="flex gap-2 items-center">
          {prog.done && <span className="py-[2px] px-3 rounded-full bg-[#e4ead6] text-[#3d4a2f] text-[12px] font-semibold">Ready for the celebrant</span>}
          <Pill size="sm" kind="outline" onClick={() => setEditing(!editing)}>
            {editing ? 'Done editing' : 'Edit questions'}
          </Pill>
          <button type="button" aria-label={`Remove ${q.title}`} onClick={remove} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[20px]">
            ×
          </button>
        </span>
      </div>
      <Label text="A note from the celebrant">
        <textarea value={q.note} maxLength={1000} rows={2} onChange={(e) => set({ note: e.target.value })} className={inputCls} placeholder="What it’s for, and when you’d like it back" />
      </Label>
      <div className="flex flex-col gap-2">
        <span className="text-[14px] font-semibold">As a file</span>
        <span className={small}>The celebrant’s questionnaire (PDF, Word or a photo):</span>
        <Attach file={q.file} label="Attach the questionnaire" onFiled={(f) => change((x) => ({ ...x, file: f }))} />
        {(q.file || q.returned.length > 0) && (
          <>
            <span className={small}>Your filled-in copy, sent back:</span>
            {q.returned.map((f) => (
              <span key={f.id} className="flex gap-2 items-center">
                <Attach file={f} label="" onFiled={(n) => change((x) => ({ ...x, returned: x.returned.map((r) => (r.id === f.id ? n : r)) }))} />
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => set({ returned: q.returned.filter((r) => r.id !== f.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
                  ×
                </button>
              </span>
            ))}
            {q.returned.length < 6 && <Attach file={null} label="Send back our filled-in copy" onFiled={(f) => change((x) => ({ ...x, returned: [...x.returned, f] }))} />}
          </>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-semibold">Questions in the app</span>
          {q.questions.map((x, i) => (
            <div key={x.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto] gap-2 items-start py-2 border-t border-[#ece3cd]">
              <span className="text-[13px] text-[#7a7466] pt-[10px]">{i + 1}</span>
              <span className="flex flex-col gap-2">
                <input aria-label="Question" value={x.text} maxLength={300} onChange={(e) => setQ(x.id, { text: e.target.value })} className={inputCls} />
                <span className="flex gap-2 flex-wrap items-center">
                  <select aria-label="Answer as" value={x.kind} onChange={(e) => setQ(x.id, { kind: e.target.value as CeremonyQuestion['kind'] })} className={`${inputCls} !py-[6px]`}>
                    <option value="short">Short answer</option>
                    <option value="long">Long answer</option>
                    <option value="choice">A choice</option>
                  </select>
                  {x.kind === 'choice' && (
                    <input
                      aria-label="Choices, separated by commas"
                      placeholder="Choices, separated by commas"
                      value={x.options.join(', ')}
                      onChange={(e) =>
                        setQ(x.id, {
                          options: e.target.value
                            .split(',')
                            .map((o) => o.trimStart().slice(0, 80))
                            .slice(0, 10),
                        })
                      }
                      className={`${inputCls} flex-1 min-w-[180px] !py-[6px]`}
                    />
                  )}
                </span>
              </span>
              <button type="button" aria-label="Remove question" onClick={() => set({ questions: q.questions.filter((y) => y.id !== x.id) }, true)} className="p-0 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px] pt-[8px]">
                ×
              </button>
            </div>
          ))}
          {q.questions.length < 60 && (
            <Pill size="sm" kind="outline" className="self-start" onClick={() => set({ questions: [...q.questions, { id: newId(), kind: 'long', text: '', options: [] }] }, true)}>
              + Add a question
            </Pill>
          )}
        </div>
      ) : (
        q.questions.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center gap-2 flex-wrap">
              <Chips<P>
                label="Who’s answering"
                items={(['p1', 'p2'] as const).map((p) => ({ key: p, label: `${names[p]} · ${prog[p].answered} of ${prog[p].asked}${prog[p].ready ? ' · ready' : ''}` }))}
                value={who}
                onChange={setWho}
              />
            </div>
            <span className={small}>{names[who]}’s answers. Each of you answers on your own.</span>
            {q.questions.map((x, i) => {
              const a = q.answers[who][x.id] ?? '';
              return (
                <label key={x.id} className="flex flex-col gap-[6px] text-[15px]">
                  <span>
                    <span className="text-[#7a7466] mr-2">{i + 1}.</span>
                    {x.text}
                  </span>
                  {x.kind === 'choice' ? (
                    <select value={a} onChange={(e) => answer(x.id, e.target.value)} className={inputCls}>
                      <option value="">Choose…</option>
                      {x.options.filter((o) => o.trim()).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : x.kind === 'long' ? (
                    <textarea value={a} rows={4} maxLength={4000} onChange={(e) => answer(x.id, e.target.value)} className={inputCls} />
                  ) : (
                    <input value={a} maxLength={4000} onChange={(e) => answer(x.id, e.target.value)} className={inputCls} />
                  )}
                </label>
              );
            })}
            <label className="flex items-center gap-2 text-[15px] font-medium">
              <input type="checkbox" className={tick} checked={q.ready[who]} onChange={() => set({ ready: { ...q.ready, [who]: !q.ready[who] } }, true)} />
              {names[who]}’s answers are ready for the celebrant
            </label>
          </div>
        )
      )}
    </section>
  );
}

// ---------------------------------------------------------------- the legal paperwork

function Paperwork({ p, names, weddingDay, today, onChange, update }: { p: PaperworkDoc; names: Record<P, string>; weddingDay: string; today: string; onChange: (p: PaperworkDoc, now?: boolean) => void; update: (fn: (p: PaperworkDoc) => PaperworkDoc) => void }) {
  const set = (patch: Partial<PaperworkDoc>, now = false) => onChange({ ...p, ...patch }, now);
  const noim = noimStatus(weddingDay, today, p.noimLodged);
  const setItem = (side: P, key: 'birth' | 'photoId' | 'ended', patch: Partial<PaperItem>, now = true) => set({ papers: { ...p.papers, [side]: { ...p.papers[side], [key]: { ...p.papers[side][key], ...patch } } } }, now);
  const fileItem = (side: P, key: 'birth' | 'photoId' | 'ended', f: CeremonyFile) => update((x) => ({ ...x, papers: { ...x.papers, [side]: { ...x.papers[side], [key]: { ...x.papers[side][key], file: f } } } }));
  const bdm = p.state ? BDM_LINKS[p.state] : null;
  const warn =
    noim.state === 'late'
      ? `It had to reach your celebrant by ${nice(noim.latest)}. Talk to them today: only a prescribed authority can allow a shorter time, and only in special cases.`
      : noim.state === 'closing'
        ? `Only ${noim.daysLeft} ${noim.daysLeft === 1 ? 'day' : 'days'} left: get it to your celebrant by ${nice(noim.latest)}.`
        : '';

  // A plain function, not a component: the upload in it keeps its state while the page saves.
  const docRow = (side: P, k: 'birth' | 'photoId' | 'ended', title: string, hint: string) => {
    const it = p.papers[side][k];
    return (
      <div key={k} className="flex flex-col gap-1 py-2 border-t border-[#ece3cd]">
        <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" className={`${tick} mt-[2px]`} checked={it.done} onChange={() => setItem(side, k, { done: !it.done })} />
          <span>
            {title}
            <span className={`block ${small}`}>{hint}</span>
          </span>
        </label>
        <span className="pl-7">
          <Attach file={it.file} label="Attach a copy" onFiled={(f) => fileItem(side, k, f)} />
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 py-3 px-4 rounded-[12px] bg-[var(--adm-tint,#f3ecd6)] text-[14px] text-[#3d4a2f]">This is a guide to the usual steps for marrying in Australia. Your celebrant confirms exactly what you need, and checks your documents in person.</p>

      <section aria-label="Notice of Intended Marriage" className={card}>
        <H2>1. Notice of Intended Marriage</H2>
        <p className={`m-0 ${small}`}>
          The form that tells your celebrant you plan to marry. It must reach them at least one month, and no more than 18 months, before the wedding.{' '}
          <a href={NOIM_FORM_URL} target="_blank" rel="noopener" className="!text-[var(--adm-ink,#33402f)] underline">
            The form
          </a>
        </p>
        {noim.state === 'unknown' ? (
          <p className={`m-0 ${small}`}>Add your wedding’s date (in your events) to see your dates.</p>
        ) : (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
            <div className="p-3 rounded-[12px] border border-[var(--adm-line,#e2d7bc)]">
              <span className="block text-[12px] font-semibold tracking-[.1em] uppercase text-[var(--adm-muted,#5b6a52)]">Earliest</span>
              <span className="text-[16px]">{nice(noim.earliest)}</span>
            </div>
            <div className={`p-3 rounded-[12px] border ${noim.state === 'late' || noim.state === 'closing' ? 'border-[#a5533c]' : 'border-[var(--adm-line,#e2d7bc)]'}`}>
              <span className="block text-[12px] font-semibold tracking-[.1em] uppercase text-[var(--adm-muted,#5b6a52)]">Last day</span>
              <span className="text-[16px]">{nice(noim.latest)}</span>
            </div>
          </div>
        )}
        {noim.state === 'early' && <p className={`m-0 ${small}`}>Too early yet: you can lodge it from {nice(noim.earliest)}.</p>}
        {warn && (
          <p role="alert" className="m-0 text-[14px] font-semibold text-[#7a4a37]">
            {warn}
          </p>
        )}
        <Label text="The day it reached our celebrant">
          <input type="date" value={p.noimLodged} onChange={(e) => set({ noimLodged: e.target.value }, true)} className={`${inputCls} max-w-[220px]`} />
        </Label>
        {p.noimLodged && <span className="text-[14px] text-[#3d4a2f]">Lodged on {nice(p.noimLodged)} ✓</span>}
      </section>

      <section aria-label="Your documents" className={card}>
        <H2>2. Your documents</H2>
        <p className={`m-0 ${small}`}>Show your celebrant the originals. Tick each once they’ve seen it; a copy here is just for your own records.</p>
        <div className="grid gap-4 md:grid-cols-2">
          {(['p1', 'p2'] as const).map((side) => (
            <div key={side} className="flex flex-col">
              <strong className="text-[15px] pb-1">{names[side]}</strong>
              {docRow(side, 'birth', 'Date and place of birth', 'A birth certificate (or extract), or a passport')}
              {docRow(side, 'photoId', 'Photo ID', 'A driver licence or a passport')}
              <label className="flex items-center gap-2 text-[14px] py-2 border-t border-[#ece3cd]">
                <input type="checkbox" className={tick} checked={p.papers[side].married} onChange={() => set({ papers: { ...p.papers, [side]: { ...p.papers[side], married: !p.papers[side].married } } }, true)} />
                {names[side]} has been married before
              </label>
              {p.papers[side].married && docRow(side, 'ended', 'Proof the last marriage ended', 'A divorce certificate, or a death certificate')}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Before the ceremony" className={card}>
        <H2>3. Before the ceremony</H2>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" className={`${tick} mt-[2px]`} checked={p.declaration} onChange={() => set({ declaration: !p.declaration }, true)} />
          <span>
            Declaration of No Legal Impediment signed
            <span className={`block ${small}`}>You each sign it with your celebrant before the ceremony (often at the rehearsal or on the day).</span>
          </span>
        </label>
      </section>

      <section aria-label="On the day" className={card}>
        <H2>4. On the day</H2>
        <span className={small}>Two witnesses, both over 18, who watch you marry and sign the certificates.</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <Label text="Witness 1">
            <input value={p.witness1} maxLength={80} onChange={(e) => set({ witness1: e.target.value })} className={inputCls} />
          </Label>
          <Label text="Witness 2">
            <input value={p.witness2} maxLength={80} onChange={(e) => set({ witness2: e.target.value })} className={inputCls} />
          </Label>
        </div>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" className={`${tick} mt-[2px]`} checked={p.signed} onChange={() => set({ signed: !p.signed }, true)} />
          <span>
            The three marriage certificates signed
            <span className={`block ${small}`}>By you both, your witnesses and the celebrant. You keep the ceremonial one; it isn’t the official certificate.</span>
          </span>
        </label>
      </section>

      <section aria-label="After the wedding" className={card}>
        <H2>5. After the wedding</H2>
        <span className={small}>Your celebrant lodges your marriage with your state’s Births, Deaths and Marriages registry within 14 days.</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <Label text="The state you marry in">
            <select value={p.state} onChange={(e) => set({ state: e.target.value as PaperworkDoc['state'] }, true)} className={inputCls}>
              <option value="">Choose…</option>
              {AU_STATES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </Label>
          <Label text="Day the celebrant lodged it">
            <input type="date" value={p.registered} onChange={(e) => set({ registered: e.target.value }, true)} className={inputCls} />
          </Label>
        </div>
        <label className="flex items-start gap-2 text-[15px]">
          <input type="checkbox" className={`${tick} mt-[2px]`} checked={p.certificate} onChange={() => set({ certificate: !p.certificate }, true)} />
          <span>
            Applied for the official marriage certificate
            <span className={`block ${small}`}>You need it to change your name. Apply to the registry once your marriage is registered; fees are on its site.</span>
          </span>
        </label>
        {bdm ? (
          <a href={bdm.url} target="_blank" rel="noopener" className="self-start text-[14px] !text-[var(--adm-ink,#33402f)] underline">
            {bdm.name}
          </a>
        ) : (
          <span className={small}>Choose your state for its registry’s link.</span>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- the ceremony

function Rows<T extends { id: string }>({ title, items, add, render, onChange, empty }: { title: string; items: T[]; add: () => T; render: (it: T, set: (patch: Partial<T>) => void) => ReactNode; onChange: (l: T[], now?: boolean) => void; empty?: ReactNode }) {
  const move = (i: number, d: number) => {
    const l = [...items];
    const [x] = l.splice(i, 1);
    if (!x) return;
    l.splice(i + d, 0, x);
    onChange(l, true);
  };
  return (
    <section aria-label={title} className={card}>
      <H2>{title}</H2>
      {!items.length && empty}
      {items.map((it, i) => (
        <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start py-2 border-t border-[#ece3cd] first-of-type:border-t-0">
          <div className="flex flex-col gap-2 min-w-0">{render(it, (patch) => onChange(items.map((x) => (x.id === it.id ? { ...x, ...patch } : x))))}</div>
          <span className="flex gap-1 items-center">
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="w-8 h-8 border-0 bg-transparent cursor-pointer text-[var(--adm-muted,#5b6a52)] disabled:opacity-30">
              ↑
            </button>
            <button type="button" aria-label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="w-8 h-8 border-0 bg-transparent cursor-pointer text-[var(--adm-muted,#5b6a52)] disabled:opacity-30">
              ↓
            </button>
            <button type="button" aria-label="Remove" onClick={() => onChange(items.filter((x) => x.id !== it.id), true)} className="w-8 h-8 border-0 bg-transparent cursor-pointer text-[#7a7466] text-[18px]">
              ×
            </button>
          </span>
        </div>
      ))}
      <Pill size="sm" kind="outline" className="self-start" onClick={() => onChange([...items, add()], true)}>
        + Add
      </Pill>
    </section>
  );
}

function TheCeremony({
  doc,
  names,
  me,
  celebrants,
  startsAt,
  tz,
  put,
}: {
  doc: CeremonyDoc;
  names: Record<P, string>;
  me: string;
  celebrants: { name: string; email: string }[];
  startsAt: string;
  tz: string | undefined;
  put: (patch: Partial<CeremonyDoc>, now?: boolean) => void;
}) {
  const c = doc.celebrant;
  const helper = celebrants[0];
  // Filled in from the celebrant who helps run the wedding, until you type something else.
  const cel = { ...c, name: c.name || helper?.name || '', email: c.email || helper?.email || '' };
  const setCel = (patch: Partial<CeremonyDoc['celebrant']>) => put({ celebrant: { ...cel, ...patch } });
  const time = startsAt ? new Date(startsAt).toLocaleString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: tz || 'Australia/Sydney' }) : '';
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Your celebrant" className={card}>
        <H2>Your celebrant</H2>
        <div className="grid gap-2 sm:grid-cols-3">
          <Label text="Name">
            <input value={cel.name} maxLength={120} onChange={(e) => setCel({ name: e.target.value })} className={inputCls} />
          </Label>
          <Label text="Mobile">
            <input value={cel.phone} maxLength={40} inputMode="tel" onChange={(e) => setCel({ phone: e.target.value })} className={inputCls} />
          </Label>
          <Label text="Email">
            <input value={cel.email} maxLength={200} type="email" onChange={(e) => setCel({ email: e.target.value })} className={inputCls} />
          </Label>
        </div>
        {time && <span className={small}>The ceremony starts {time} (change it in your event’s details; the run sheet follows it).</span>}
      </section>

      <Rows
        title="Order of the ceremony"
        items={doc.order}
        add={() => ({ id: newId(), part: '', who: '', detail: '' })}
        onChange={(order, now) => put({ order }, now)}
        empty={
          <Pill kind="primary" className="self-start" onClick={() => put({ order: CEREMONY_ORDER.map((x) => ({ ...x, id: newId() })) }, true)}>
            Start with the usual order
          </Pill>
        }
        render={(it, set) => (
          <>
            <input aria-label="Part" placeholder="Part (Welcome, Vows…)" value={it.part} maxLength={120} onChange={(e) => set({ part: e.target.value })} className="bg-transparent border-0 p-0 text-[15px] font-medium" />
            <input aria-label="Who" placeholder="Who" value={it.who} maxLength={120} onChange={(e) => set({ who: e.target.value })} className={`${inputCls} !py-[6px]`} />
            <input aria-label="What happens" placeholder="What happens" value={it.detail} maxLength={400} onChange={(e) => set({ detail: e.target.value })} className={`${inputCls} !py-[6px]`} />
          </>
        )}
      />

      <Rows
        title="Readings"
        items={doc.readings}
        add={() => ({ id: newId(), title: '', reader: '' })}
        onChange={(readings, now) => put({ readings }, now)}
        empty={<span className={small}>A poem, a passage or a few words, and who reads each.</span>}
        render={(it, set) => (
          <span className="grid gap-2 sm:grid-cols-2">
            <input aria-label="Reading" placeholder="The reading" value={it.title} maxLength={160} onChange={(e) => set({ title: e.target.value })} className={`${inputCls} !py-[6px]`} />
            <input aria-label="Reader" placeholder="Read by" value={it.reader} maxLength={80} onChange={(e) => set({ reader: e.target.value })} className={`${inputCls} !py-[6px]`} />
          </span>
        )}
      />

      <section aria-label="Vows" className={card}>
        <H2>Vows</H2>
        <span className={small}>Write your own here. Keep yours private and only you will see them (your celebrant gets them from you).</span>
        <div className="grid gap-4 md:grid-cols-2">
          {(['p1', 'p2'] as const).map((side) => {
            const v = doc.vows[side];
            const hidden = v.private && !!v.by && v.by !== me;
            return (
              <div key={side} className="flex flex-col gap-2">
                <strong className="text-[15px]">{names[side]}’s vows</strong>
                {hidden ? (
                  <span className={`${small} italic`}>Kept private by whoever wrote them.</span>
                ) : (
                  <>
                    <textarea value={v.text} rows={6} maxLength={4000} onChange={(e) => put({ vows: { ...doc.vows, [side]: { ...v, text: e.target.value } } })} className={inputCls} />
                    <label className="flex items-center gap-2 text-[14px]">
                      <input type="checkbox" className={tick} checked={v.private} onChange={() => put({ vows: { ...doc.vows, [side]: { ...v, private: !v.private } } }, true)} />
                      Private: only I can see these
                    </label>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <Rows
        title="Music"
        items={doc.music}
        add={() => ({ id: newId(), moment: '', song: '' })}
        onChange={(music, now) => put({ music }, now)}
        empty={
          <Pill
            kind="outline"
            className="self-start"
            onClick={() => put({ music: ['Guests arriving', 'The entrance', 'Signing', 'Walking out together'].map((moment) => ({ id: newId(), moment, song: '' })) }, true)}
          >
            Add the usual moments
          </Pill>
        }
        render={(it, set) => (
          <span className="grid gap-2 sm:grid-cols-2">
            <input aria-label="Moment" placeholder="When" value={it.moment} maxLength={80} onChange={(e) => set({ moment: e.target.value })} className={`${inputCls} !py-[6px]`} />
            <input aria-label="Song" placeholder="Song and artist" value={it.song} maxLength={160} onChange={(e) => set({ song: e.target.value })} className={`${inputCls} !py-[6px]`} />
          </span>
        )}
      />

      <section aria-label="Notes" className={card}>
        <H2>Notes for the celebrant</H2>
        <textarea value={doc.notes} rows={3} maxLength={2000} onChange={(e) => put({ notes: e.target.value })} className={inputCls} placeholder="Anything else: names to say right, people to remember, the plan if it rains" />
      </section>
    </div>
  );
}
