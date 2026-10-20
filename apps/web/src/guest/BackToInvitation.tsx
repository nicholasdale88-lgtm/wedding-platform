/**
 * "← Your invitation": the way back from any guest page opened with the guest's own link (the photo page,
 * the night-before guide), the same everywhere. Nothing on the public pages or in the couple's preview.
 */
export function BackToInvitation({ slug, token, ink = '#33402f' }: { slug: string; token: string; ink?: string }) {
  if (!token) return null;
  return (
    <a
      href={`/w/${encodeURIComponent(slug)}?g=${encodeURIComponent(token)}`}
      className="fixed z-40 top-[max(14px,env(safe-area-inset-top))] left-4 py-[9px] px-4 rounded-full text-[16px] no-underline shadow-[0_6px_18px_rgba(30,30,30,.18)]"
      style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", background: 'rgba(251,248,242,.94)', color: ink }}
    >
      ← Your invitation
    </a>
  );
}
