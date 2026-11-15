import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import { useEffect } from 'react';

/**
 * What a guest sees when a page can't be shown (old link, typo, not their event): the stationery's
 * look, a plain sentence, and nothing that leads to the admin.
 */
export function GuestMessage({ message, title = '' }: { message: string; title?: string }) {
  useEffect(() => {
    document.title = title || ' ';
  }, [title]);
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-5 px-8 text-center bg-[#f6f0e2] text-[#33402f]" style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}>
      <span aria-hidden className="block w-10 border-t border-[#b39563]" />
      <p role="alert" className="max-w-[340px] text-[23px] leading-snug italic">
        {message}
      </p>
      <span aria-hidden className="block w-10 border-t border-[#b39563]" />
      {/* A link that leads nowhere: what to do next, still without pointing at the admin. */}
      {/could not find/i.test(message) && (
        <p className="m-0 max-w-[320px] text-[16px] leading-relaxed not-italic text-[#5b6a52]" style={{ fontFamily: 'system-ui, sans-serif' }}>
          Each invitation link is personal. Open the one sent to you by text or email, or ask the couple to send it again.
        </p>
      )}
    </main>
  );
}

/** Any address that isn't a page. */
export function GuestNotFound() {
  return <GuestMessage message="We could not find this page. Please use the link from your invitation text." />;
}
