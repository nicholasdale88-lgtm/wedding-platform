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
    </main>
  );
}

/** Any address that isn't a page. */
export function GuestNotFound() {
  return <GuestMessage message="We could not find this page. Please use the link from your invitation text." />;
}
