import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/** Wedding sections a guest invited only to the second event (the birthday) doesn't see. */
export const SOLO_HIDDEN = new Set(['01 Welcome', '01b Countdown', '02 The Wedding', '03 Timeline', '07 Dress Code', '08 Accommodation', '09 Gift Registry']);
const SECTION = '[data-screen-label="05 Birthday & Horse Riding"]';
const FAQ = '[data-screen-label="11 FAQ"]';

/** "Nicholas's 30th" -> "30"; otherwise the event's first letter. */
export const sealFor = (name: string) => name.match(/\d+/)?.[0] ?? (name.trim()[0] ?? '').toUpperCase();

const p2 = (n: number) => String(n).padStart(2, '0');

/**
 * The top of the invitation for someone invited only to the birthday: its name, when, a countdown and a
 * way to reply, in the birthday's blue. It goes in front of the birthday's own section (the design's
 * wedding welcome, countdown and wedding sections are hidden for them), and the wedding's FAQ groups
 * are tucked away so only the birthday's questions remain.
 */
export function BirthdayHero({ name, startsAt, timezone, greet, colours }: { name: string; startsAt: string; timezone: string; greet: string; colours: { bg: string; ink: string; accent: string } }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    // Find the birthday's section once it's drawn, and put the hero just before it.
    let el: HTMLElement | null = null;
    let tries = 0;
    const place = () => {
      const sec = document.querySelector<HTMLElement>(SECTION);
      if (!sec?.parentElement) return tries++ < 50 ? void setTimeout(place, 40) : undefined;
      el = document.createElement('div');
      el.setAttribute('data-solo-hero', '');
      sec.parentElement.insertBefore(el, sec);
      setHost(el);
      // Only the birthday's own questions: the wedding's groups come before its box in the FAQ.
      const faq = document.querySelector<HTMLElement>(FAQ);
      const box = faq && [...faq.querySelectorAll<HTMLElement>('div')].find((d) => d.style.background && /231,\s*238,\s*248|#e7eef8/i.test(d.style.background));
      for (let s = box?.previousElementSibling as HTMLElement | null; s; s = s.previousElementSibling as HTMLElement | null) s.style.display = 'none';
    };
    place();
    return () => {
      tries = 99;
      el?.remove();
    };
  }, []);
  if (!host) return null;
  const at = new Date(startsAt);
  const valid = !Number.isNaN(at.getTime());
  const when = valid ? new Intl.DateTimeFormat('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: timezone }).format(at) : '';
  const time = valid ? new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(at).replace(' ', '').toLowerCase() : '';
  const ms = Math.max(0, (valid ? at.getTime() : now) - now);
  const cd = [
    [String(Math.floor(ms / 864e5)), 'days'],
    [p2(Math.floor(ms / 36e5) % 24), 'hours'],
    [p2(Math.floor(ms / 6e4) % 60), 'mins'],
    [p2(Math.floor(ms / 1e3) % 60), 'secs'],
  ];
  return createPortal(
    <section
      aria-label={name}
      style={{
        margin: 14,
        borderRadius: '200px 200px 28px 28px',
        minHeight: '86vh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 22,
        padding: '90px max(30px, calc((100% - 480px) / 2))',
        textAlign: 'center',
        background: colours.bg,
        color: colours.ink,
        fontFamily: "'Cormorant Garamond', Georgia, serif",
      }}
    >
      {greet && <div style={{ fontSize: 'clamp(22px,6vw,28px)', fontStyle: 'italic' }}>{greet}</div>}
      <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '.34em', textTransform: 'uppercase', color: colours.accent }}>You’re invited to</div>
      <h1 style={{ margin: 0, fontFamily: "'Pinyon Script', cursive", fontWeight: 400, fontSize: 'clamp(48px,14vw,72px)', lineHeight: 1.1 }}>{name}</h1>
      {when && (
        <div style={{ fontSize: 'clamp(19px,5vw,23px)', lineHeight: 1.5 }}>
          {when}
          {time && <div>from {time}</div>}
        </div>
      )}
      {valid && ms > 0 && (
        <div role="timer" aria-label={`${cd[0]![0]} days to go`} style={{ display: 'flex', gap: 16, marginTop: 6 }}>
          {cd.map(([n, l]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52 }}>
              <span style={{ fontSize: 34, lineHeight: 1 }}>{n}</span>
              <span style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', opacity: 0.8 }}>{l}</span>
            </div>
          ))}
        </div>
      )}
      <a
        href="#rsvp"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const r = document.getElementById('rsvp');
          r?.parentElement?.scrollTo({ top: r.offsetTop - 8, behavior: 'smooth' });
        }}
        style={{ marginTop: 10, padding: '11px 26px', borderRadius: 999, border: `1px solid ${colours.ink}`, color: colours.ink, textDecoration: 'none', fontSize: 18 }}
      >
        Reply
      </a>
    </section>,
    host,
  );
}
