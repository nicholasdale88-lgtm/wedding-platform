import { unzip, type Unzipped } from 'fflate';
import { useRef, useState } from 'react';
import { photosApi } from '../../lib/api';
import { Pill, useToast } from '../ui';

/**
 * Photos → "Add photos from a WhatsApp group": WhatsApp can't let another app read a group, but any
 * member can export the chat ("Export chat" → "Attach media") as a .zip. Pick that zip here: its photos
 * go into this event's album, each credited to whoever posted it in the chat. Everything is unzipped in
 * the browser; importing the same export again adds nothing twice (the server spots repeats).
 */

const PHOTO = /\.(jpe?g|png|webp|gif|heic|heif)$/i;
const TYPE: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heic' };
const base = (path: string) => path.split('/').pop() ?? path;

/**
 * Who posted each attachment, from the chat's text file. Handles both export styles:
 *   iPhone:  [18/11/2027, 8:15:03 pm] Alex: <attached: 00000012-PHOTO-2027-11-18-20-15-03.jpg>
 *   Android: 18/11/2027, 20:15 - Alex: IMG-20271118-WA0001.jpg (file attached)
 */
export function sendersFromChat(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/[‎‏‪‬]/g, '');
    const m = /^\[?\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s[^\]]*?(?:\]\s|\s-\s)([^:]{1,80}):\s(.*)$/.exec(line);
    if (!m) continue;
    const file = /([\w.-]+\.(?:jpe?g|png|webp|gif|heic|heif))/i.exec(m[2]!);
    if (file) out.set(file[1]!, m[1]!.trim());
  }
  return out;
}

const unzipAsync = (bytes: Uint8Array) =>
  new Promise<Unzipped>((resolve, reject) =>
    unzip(bytes, { filter: (f) => PHOTO.test(f.name) || /\.txt$/i.test(f.name) }, (e, files) => (e ? reject(e) : resolve(files))),
  );

export function ChatImport({ wid, events, event: fixed, onDone }: { wid: string; events: { key: string; name: string }[]; event?: string; onDone: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [event, setEvent] = useState(fixed ?? events[0]?.key ?? '');
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; added: number; repeat: number; failed: number } | null>(null);
  const busy = !!progress && progress.done < progress.total;

  const run = async (file: File) => {
    try {
      setProgress({ done: 0, total: 1, added: 0, repeat: 0, failed: 0 });
      const files = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
      const chat = Object.entries(files).find(([n]) => /\.txt$/i.test(n));
      const who = chat ? sendersFromChat(new TextDecoder().decode(chat[1])) : new Map<string, string>();
      const photos = Object.entries(files).filter(([n]) => PHOTO.test(n) && !base(n).startsWith('.'));
      if (!photos.length) {
        setProgress(null);
        toast('No photos in that zip. In WhatsApp, export the chat with "Attach media".');
        return;
      }
      const tally = { done: 0, total: photos.length, added: 0, repeat: 0, failed: 0 };
      setProgress({ ...tally });
      let next = 0;
      const worker = async () => {
        while (next < photos.length) {
          const [name, bytes] = photos[next++]!;
          const ext = (name.split('.').pop() ?? '').toLowerCase();
          try {
            const r = await photosApi.upload(wid, new Blob([bytes], { type: TYPE[ext] ?? 'image/jpeg' }), `${who.get(base(name)) ?? 'Group chat'}`, event);
            if (r.duplicate) tally.repeat++;
            else tally.added++;
          } catch {
            tally.failed++;
          }
          tally.done++;
          setProgress({ ...tally });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      toast(`${tally.added} photos added${tally.repeat ? `, ${tally.repeat} already there` : ''}${tally.failed ? `, ${tally.failed} could not be added` : ''}`);
      onDone();
    } catch {
      setProgress(null);
      toast('That file could not be opened. Pick the .zip WhatsApp made when you exported the chat.');
    } finally {
      if (input.current) input.current.value = '';
    }
  };

  if (!open) {
    return (
      <Pill kind="dashed" onClick={() => setOpen(true)}>
        Add photos from a WhatsApp group
      </Pill>
    );
  }
  return (
    <section aria-label="Add photos from a WhatsApp group" className="flex flex-col gap-3 p-4 rounded-[14px] border border-[#e2d7bc] bg-[#fbf8f0] text-[14px]">
      <div className="flex justify-between items-start gap-3">
        <strong className="font-semibold text-[15px]">Add photos from a WhatsApp group</strong>
        <button type="button" aria-label="Close" onClick={() => setOpen(false)} disabled={busy} className="p-0 border-0 bg-transparent text-[20px] leading-none cursor-pointer">
          ×
        </button>
      </div>
      <ol className="m-0 pl-5 flex flex-col gap-1 text-[#5b6a52]">
        <li>In WhatsApp, open the group, tap its name, then <em>Export chat</em> and choose <em>Attach media</em>.</li>
        <li>Save the .zip it makes (to Files, Drive or email it to yourself).</li>
        <li>Pick that .zip below. Each photo is credited to whoever posted it. Importing again later only adds the new ones.</li>
      </ol>
      <div className="flex gap-3 items-center flex-wrap">
        {!fixed && events.length > 1 && (
          <label className="flex items-center gap-2">
            Into the album for
            <select value={event} onChange={(e) => setEvent(e.target.value)} disabled={busy} className="py-[6px] px-2 rounded-[8px] border border-[#d3c6a4] bg-white">
              {events.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <input ref={input} type="file" accept=".zip,application/zip" disabled={busy} aria-label="WhatsApp chat export (.zip)" onChange={(e) => e.target.files?.[0] && void run(e.target.files[0])} />
      </div>
      {progress && (
        <div role="status" className="flex flex-col gap-1">
          <div className="h-[6px] rounded-full bg-[#e2d7bc] overflow-hidden">
            <div className="h-full bg-[#5d6b47] transition-[width]" style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
          </div>
          <span className="text-[13px] text-[#5b6a52]">
            {busy ? `Adding ${progress.done} of ${progress.total}…` : `Done: ${progress.added} added${progress.repeat ? `, ${progress.repeat} already there` : ''}${progress.failed ? `, ${progress.failed} could not be added` : ''}.`}
          </span>
        </div>
      )}
    </section>
  );
}
