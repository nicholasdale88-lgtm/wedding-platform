import { useEffect, useRef, useState } from 'react';
import { plannerApi } from '../../lib/api';
import { fileProblem, shrinkFile } from '../../lib/shrinkFile';
import { useAdmin } from '../Shell';

export type QuoteRead = Awaited<ReturnType<typeof plannerApi.readQuote>>;

/** Whether the assistant can read quote files on this site (asked once per visit). */
let readsCache: Promise<boolean> | null = null;
export function useReadsQuotes() {
  const { wid } = useAdmin();
  const [on, setOn] = useState(false);
  useEffect(() => {
    readsCache ??= plannerApi.aiStatus(wid).then((s) => !!s.readsFiles, () => false);
    void readsCache.then(setOn);
  }, [wid]);
  return on;
}

/**
 * Drop a quote here (or tap to choose): a PDF or a photo. Big photos are made smaller first; it's filed with
 * the wedding's planning files; when the assistant is on, it reads the numbers out to fill in (to check).
 */
export function QuoteFile({ fileId, fileName, onFiled, onRead }: { fileId: string; fileName: string; onFiled: (f: { id: string; name: string }) => void; onRead?: (r: QuoteRead) => void }) {
  const { wid } = useAdmin();
  const reads = useReadsQuotes();
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const take = async (picked: File | undefined) => {
    if (!picked) return;
    setProblem('');
    setBusy('Getting it ready…');
    try {
      const file = await shrinkFile(picked);
      const why = fileProblem(file);
      if (why) return setProblem(why);
      setBusy('Filing it…');
      const f = await plannerApi.uploadFile(wid, file);
      onFiled(f);
      if (reads && onRead) {
        setBusy('Reading the numbers…');
        try {
          onRead(await plannerApi.readQuote(wid, f.id));
        } catch {
          setProblem('Filed. Couldn’t read the numbers from it: fill them in below.');
        }
      }
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        role="button"
        tabIndex={0}
        aria-label={fileId ? `Quote file: ${fileName}. Choose another` : 'Attach the quote: a PDF or a photo'}
        onClick={() => !busy && input.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !busy && input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files[0]);
        }}
        className={`flex items-center gap-3 p-3 rounded-[12px] border-2 border-dashed cursor-pointer text-[14px] ${over ? 'border-[#5d6b47] bg-[#eef1e4]' : fileId ? 'border-[#a9b98d] bg-[#f3f6ea]' : 'border-[#c6b794] bg-[#fbf8f0]'}`}
      >
        <span aria-hidden className="text-[22px] leading-none">{fileId ? '📎' : '⤓'}</span>
        <span className="flex-1 min-w-0">
          {busy ? (
            <span role="status" className="italic text-[#5b6a52]">{busy}</span>
          ) : fileId ? (
            <>
              <strong className="font-semibold block truncate">{fileName || 'Quote attached'}</strong>
              <span className="text-[12px] text-[#5b6a52]">Attached. Tap to choose another.</span>
            </>
          ) : (
            <>
              <strong className="font-semibold block">Attach the quote</strong>
              <span className="text-[12px] text-[#5b6a52]">
                Drop the PDF here, or tap to choose one or take a photo.{reads && onRead ? ' The numbers are read out for you to check.' : ''}
              </span>
            </>
          )}
        </span>
        {fileId && !busy && (
          <a href={plannerApi.fileUrl(wid, fileId)} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="text-[13px] !text-[#33402f]">
            Open
          </a>
        )}
      </div>
      <input ref={input} type="file" hidden accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => void take(e.target.files?.[0])} />
      {problem && (
        <span role="alert" className="text-[13px] text-[#7a4a37]">
          {problem}
        </span>
      )}
    </div>
  );
}
