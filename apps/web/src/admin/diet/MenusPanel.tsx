import { safeFor, type Menu, type Menus } from '@wp/shared';
import { useRef, useState } from 'react';
import { plannerApi } from '../../lib/api';
import { useAdmin } from '../Shell';
import { inputCls, Pill, useToast } from '../ui';

const newId = () => crypto.randomUUID().slice(0, 10);
const COURSES = [
  ['entree', 'Entrée'],
  ['main', 'Main'],
  ['dessert', 'Dessert'],
] as const;
export const BLANK_MENU: Menu = { id: '', name: '', suits: '', entree: '', main: '', dessert: '' };
/** Usual special menus to start from (the courses are the caterer's to fill in). */
const STARTERS: [string, string][] = [
  ['Vegetarian', 'vegetarian'],
  ['Vegan', 'vegan, plant based'],
  ['Gluten free', 'gluten, coeliac, celiac'],
  ['Dairy free', 'dairy, lactose'],
  ['Nut free', 'nut free, peanut free'],
  ['Kids', 'kid, child'],
];

/**
 * Dietary → Menus: the set menu everyone has, the special menus (each saying who it suits, so guests are
 * matched to one), and the caterer's own menus as files. Guests with a need are given one below.
 */
export function MenusPanel({ menus, set }: { menus: Menus; set: (m: Menus, now?: boolean) => void }) {
  const { wid } = useAdmin();
  const toast = useToast();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const setSpecial = (id: string, p: Partial<Menu>) => set({ ...menus, special: menus.special.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const courses = (m: Menu, onPatch: (p: Partial<Menu>) => void, who: string) => (
    <div className="grid gap-2 sm:grid-cols-3">
      {COURSES.map(([k, label]) => (
        <label key={k} className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          {label}
          <input aria-label={`${who}: ${label}`} value={m[k]} maxLength={200} onChange={(e) => onPatch({ [k]: e.target.value } as Partial<Menu>)} className={`${inputCls} !py-2 !text-[14px]`} />
        </label>
      ))}
    </div>
  );
  /** What a menu counts as safe for when guests are matched to it (from its name and "suits" words). */
  const safeChips = (m: Menu) => {
    const safe = [...safeFor(`${m.suits}, ${m.name}`)];
    return (
      <span className="flex gap-1 flex-wrap text-[12px]">
        {safe.length ? (
          safe.map((x) => (
            <span key={x} className="py-[2px] px-2 rounded-full bg-[#dfe5cc] text-[#3d4a2f]">
              {x === 'Nut allergy' ? 'Nut free' : x === 'Seafood' ? 'Seafood free' : x === 'Egg' ? 'Egg free' : x}
            </span>
          ))
        ) : (
          <span className="text-[#7a7466]">Not marked safe for any dietary need yet</span>
        )}
      </span>
    );
  };
  const unused = STARTERS.filter(([n]) => !menus.special.some((m) => m.name.toLowerCase() === n.toLowerCase()));

  return (
    <section aria-label="Menus" className="flex flex-col gap-4 p-5 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0]">
      <div>
        <h2 className="m-0 font-display font-medium text-[26px]">Menus</h2>
        <p className="m-0 mt-1 text-[14px] text-[#5b6a52]">Everyone has the set menu, except guests you give a special one. Add the caterer’s menus as files to keep them with the plan.</p>
      </div>
      <div className="flex flex-col gap-2 p-4 rounded-[12px] bg-white border border-[#e2d7bc]">
        <strong className="font-semibold">Set menu</strong>
        {courses(menus.set, (p) => set({ ...menus, set: { ...menus.set, ...p, name: 'Set menu' } }), 'Set menu')}
        <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
          The set menu is already (if the caterer says so)
          <input
            aria-label="Set menu: safe for"
            placeholder="e.g. nut free, halal"
            value={menus.set.suits}
            maxLength={200}
            onChange={(e) => set({ ...menus, set: { ...menus.set, suits: e.target.value, name: 'Set menu' } })}
            className={`${inputCls} !py-2`}
          />
        </label>
        {safeChips(menus.set)}
      </div>
      {menus.special.map((m) => (
        <div key={m.id} className="flex flex-col gap-2 p-4 rounded-[12px] bg-white border border-[#e2d7bc]">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] items-end">
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Menu
              <input aria-label="Menu name" value={m.name} maxLength={80} onChange={(e) => setSpecial(m.id, { name: e.target.value })} className={`${inputCls} !py-2 font-semibold`} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[#5b6a52]">
              Suits guests who wrote
              <input aria-label={`${m.name}: suits`} placeholder="e.g. vegan, plant based" value={m.suits} maxLength={200} onChange={(e) => setSpecial(m.id, { suits: e.target.value })} className={`${inputCls} !py-2`} />
            </label>
            <button type="button" onClick={() => set({ ...menus, special: menus.special.filter((x) => x.id !== m.id) }, true)} className="pb-2 p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#7a4a37]">
              Remove
            </button>
          </div>
          {safeChips(m)}
          {courses(m, (p) => setSpecial(m.id, p), m.name || 'Special menu')}
        </div>
      ))}
      <div className="flex gap-2 flex-wrap items-center">
        <Pill kind="dashed" onClick={() => set({ ...menus, special: [...menus.special, { ...BLANK_MENU, id: newId(), name: 'Special menu' }] }, true)}>
          + A special menu
        </Pill>
        {unused.slice(0, 4).map(([name, suits]) => (
          <button key={name} type="button" onClick={() => set({ ...menus, special: [...menus.special, { ...BLANK_MENU, id: newId(), name, suits }] }, true)} className="py-[5px] px-3 rounded-full border border-[#c6b794] bg-transparent text-[13px] cursor-pointer hover:bg-[#efe7d3]">
            + {name}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 pt-3 border-t border-[#e2d7bc]">
        <strong className="font-semibold text-[15px]">The caterer’s menus</strong>
        {menus.files.map((f) => (
          <div key={f.id} className="flex justify-between items-center gap-3 text-[14px]">
            <a href={plannerApi.fileUrl(wid, f.id)} target="_blank" rel="noopener" className="!text-[#33402f] truncate">
              {f.name}
            </a>
            <button type="button" onClick={() => set({ ...menus, files: menus.files.filter((x) => x.id !== f.id) }, true)} className="p-0 border-0 bg-transparent underline cursor-pointer text-[13px] text-[#7a4a37]">
              Remove
            </button>
          </div>
        ))}
        <input
          ref={file}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            if (f.size > 1.5 * 1024 * 1024) return toast('That file is over 1.5 MB. Try a smaller PDF or a photo.');
            setBusy(true);
            try {
              const r = await plannerApi.uploadFile(wid, f);
              set({ ...menus, files: [...menus.files, { id: r.id, name: r.name }] }, true);
              toast('Menu added');
            } catch (err) {
              toast((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
        <Pill kind="outline" className="self-start" disabled={busy || menus.files.length >= 12} onClick={() => file.current?.click()}>
          {busy ? 'Uploading…' : 'Add a menu (PDF or photo)'}
        </Pill>
      </div>
    </section>
  );
}
