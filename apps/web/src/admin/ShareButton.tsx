/**
 * One tap to send a link: the phone's own share sheet (Messages, WhatsApp, email, anything they use), or on a
 * computer the message and link copied, ready to paste. The site's own email can be off, so sending never
 * depends on it. Email and Text stay as small extras where there's an address or number.
 */
export type ShareData = { title: string; text: string; url: string };

export async function shareOrCopy(d: ShareData, toast: (m: string) => void): Promise<boolean> {
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void>; canShare?: (d: ShareData) => boolean };
  if (nav.share && (!nav.canShare || nav.canShare(d))) {
    try {
      await nav.share(d);
      return true;
    } catch (e) {
      // They closed the share sheet: nothing sent.
      if ((e as Error).name === 'AbortError') return false;
      // Not allowed here (an old browser, or no tap behind it): copy instead.
    }
  }
  const all = d.text.includes(d.url) ? d.text : `${d.text} ${d.url}`;
  try {
    await navigator.clipboard.writeText(all);
    toast('Copied: paste it into a text, email or chat');
  } catch {
    window.prompt('Copy this and send it', all);
  }
  return true;
}

export function ShareButton({ data, toast, onShared, label = 'Share', className = '' }: { data: () => ShareData | null; toast: (m: string) => void; onShared?: () => void; label?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        const d = data();
        if (!d) return;
        if (await shareOrCopy(d, toast)) onShared?.();
      }}
      className={`min-h-[44px] inline-flex items-center gap-2 py-2 px-4 rounded-full border-0 bg-[#33402f] text-[#fbf8f2] text-[14px] font-semibold cursor-pointer ${className}`}
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
      </svg>
      {label}
    </button>
  );
}
