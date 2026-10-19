/**
 * Sending a guest their invitation without SMS: WhatsApp, Facebook Messenger, or the phone's own
 * share sheet. Each opens the app with the guest's personal message and link ready; the couple taps
 * send. (Fully automatic WhatsApp/Messenger needs Meta business approval and per-message fees.)
 */

const touch = () => typeof window !== 'undefined' && (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

/** The words sent with the link, when there's no invitation text to borrow. */
export const fallbackMessage = (first: string, couple: string, link: string) =>
  `Hi ${first}! ${couple} would love you to join them. Here's your personal invitation, with the RSVP inside: ${link}`;

/** WhatsApp: opens a chat with their number (or lets you pick someone) with the message typed in. */
export function sendWhatsApp(phoneE164: string | null, text: string) {
  const to = phoneE164 ? phoneE164.replace(/^\+/, '') : '';
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/**
 * Messenger only accepts a link (no typed text). On a phone it opens the Messenger app ready to pick
 * the guest; on a computer we copy the message and open messenger.com to paste it.
 */
export async function sendMessenger(link: string, text: string): Promise<'app' | 'copied'> {
  if (touch()) {
    window.location.href = `fb-messenger://share/?link=${encodeURIComponent(link)}`;
    return 'app';
  }
  await navigator.clipboard?.writeText(text);
  window.open('https://www.messenger.com/new', '_blank', 'noopener');
  return 'copied';
}

/** The phone's own share sheet (WhatsApp, Messenger, Instagram, email…). False if not available. */
export async function shareNative(text: string, link: string): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false;
  try {
    await navigator.share({ text: text.replace(link, '').trim(), url: link });
    return true;
  } catch {
    return false; // cancelled
  }
}
export const canShareNative = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';
