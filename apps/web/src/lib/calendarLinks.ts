/**
 * Calendar links, everywhere a page offers "add to your calendar":
 * - iPhone and Outlook subscribe to a webcal:// address;
 * - Google Calendar subscribes to the https:// address (it doesn't take webcal);
 * - in-app browsers (Instagram, Facebook, Messenger, TikTok…) can't open webcal at all, so they get the plain
 *   https .ics file to open or download.
 */
export const asWebcal = (https: string) => https.replace(/^https?:/, 'webcal:');
export const asHttps = (url: string) => url.replace(/^webcal:/, 'https:');
export const googleSubscribe = (https: string) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(asHttps(https))}`;
export const isAndroid = () => typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
export const inAppBrowser = () => typeof navigator !== 'undefined' && /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|musical_ly|Snapchat|; wv\)/i.test(navigator.userAgent);
/** The one link to subscribe with on this phone: Google on Android, the .ics file in an in-app browser, else webcal. */
export const subscribeHref = (https: string) => (isAndroid() ? googleSubscribe(https) : inAppBrowser() ? asHttps(https) : asWebcal(https));
