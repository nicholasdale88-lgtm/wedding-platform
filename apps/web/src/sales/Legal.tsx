import '@fontsource/cormorant-garamond/400.css';
import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from './Art';
import { BRAND } from './SalesPage';

/**
 * /privacy, /terms and /contact: plain-English starter pages for the front page's footer.
 * DRAFT: these are a starting point, not legal advice. The owner should have them reviewed before launch,
 * and replace the placeholder email address (SUPPORT_EMAIL) and the business details (BUSINESS).
 */

/** The support address. A placeholder until the domain is bought: replace it with the real one. */
const SUPPORT_EMAIL = 'hello@<your-domain>';
/** Who runs the site. A placeholder: replace with the legal name and ABN. */
const BUSINESS = '[business name and ABN]';
/** When these pages last changed. Update it with any change. */
const UPDATED = 'October 2026';

const INK = '#33402f';
const SOFT = '#5b6a52';
const serif = "'Cormorant Garamond', Georgia, serif";
const sans = "'DM Sans Variable', 'DM Sans', system-ui, sans-serif";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · ${BRAND}`;
    window.scrollTo(0, 0);
  }, [title]);
  return (
    <div className="min-h-screen bg-[#f6f0e2] flex flex-col" style={{ color: INK, fontFamily: sans }}>
      <header className="max-w-[1100px] w-full mx-auto px-4 py-4 flex justify-between items-center gap-3">
        <Link to="/" aria-label={`${BRAND} home`} className="no-underline">
          <Wordmark size={22} />
        </Link>
        <Link to="/admin" className="no-underline text-[15px]" style={{ color: INK }}>
          Sign in
        </Link>
      </header>
      <main className="flex-1 max-w-[760px] w-full mx-auto px-4 pt-6 pb-16 flex flex-col gap-5 text-[16px] leading-[1.65]">
        <p role="note" className="m-0 py-2 px-3 rounded-[10px] text-[14px] bg-[#fbeedd] border border-[#e8cfa4] text-[#7a4a37]">
          <strong className="font-semibold">Draft: to be reviewed before launch.</strong> This page is a plain-English starting point and hasn’t been checked by a lawyer yet.
        </p>
        <h1 className="m-0 text-[clamp(36px,6vw,48px)] font-normal leading-[1.1]" style={{ fontFamily: serif }}>
          {title}
        </h1>
        {children}
      </main>
      <LegalFooter />
    </div>
  );
}

/** The footer shared by the legal pages (the front page has its own, with the same links). */
function LegalFooter() {
  return (
    <footer className="border-t border-[#e2d7bc] py-6 px-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px]" style={{ color: SOFT }}>
      <span>
        © {new Date().getFullYear()} {BRAND}. Made in Australia.
      </span>
      <Link to="/" style={{ color: SOFT }}>
        Home
      </Link>
      <Link to="/privacy" style={{ color: SOFT }}>
        Privacy
      </Link>
      <Link to="/terms" style={{ color: SOFT }}>
        Terms
      </Link>
      <Link to="/contact" style={{ color: SOFT }}>
        Contact
      </Link>
    </footer>
  );
}

const H2 = ({ children }: { children: ReactNode }) => (
  <h2 className="m-0 mt-3 text-[26px] font-normal" style={{ fontFamily: serif }}>
    {children}
  </h2>
);
const P = ({ children }: { children: ReactNode }) => <p className="m-0">{children}</p>;
const List = ({ items }: { items: ReactNode[] }) => (
  <ul className="m-0 pl-5 flex flex-col gap-1">
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
);
/** The placeholder email, highlighted so it's obvious it still needs replacing. */
const Email = () => (
  <mark className="px-1 rounded bg-[#fbeedd]" title="Placeholder: replace with the real support address">
    {SUPPORT_EMAIL}
  </mark>
);
const Updated = () => (
  <p className="m-0 text-[14px]" style={{ color: SOFT }}>
    Last updated {UPDATED}.
  </p>
);

export function PrivacyPage() {
  return (
    <Shell title="Privacy">
      <Updated />
      <P>
        {BRAND} is run by {BUSINESS} in Australia. Couples use it to invite guests, collect replies and plan their wedding. This page explains what we keep, why, who
        else handles it, and how to have it changed or removed. We handle personal information in line with the Australian Privacy Principles in the Privacy Act 1988.
      </P>

      <H2>What we keep</H2>
      <List
        items={[
          'About the couple: your names, email address, a passcode (stored scrambled, never in plain text), your wedding date and venue, and the plans you make in the app.',
          'About guests, as entered by the couple or by the guests themselves: names, mobile numbers, replies, how many are coming, dietary needs and allergies, and any messages sent to the couple.',
          'About the wedding party, when the couple invites them to sign in: name, email and their role on the day.',
          'Basic technical records, such as when a page was opened, kept to keep the site secure and working.',
        ]}
      />
      <P>
        Dietary needs and allergies can be health information, which the law treats as sensitive. We only use them so the couple and their caterer can feed each guest
        safely, and we never use them for anything else.
      </P>

      <H2>Why we keep it</H2>
      <List
        items={[
          'To send each guest their invitation, reminders and the night-before guide, and record their reply.',
          'To give the couple their guest list, numbers, seating and dietary lists.',
          'To answer questions guests text in, from what the couple has already written.',
          'To take payment and send receipts.',
          'To send the odd planning tip by email, only if you ticked the box. You can stop these at any time.',
        ]}
      />
      <P>We don’t sell personal information, and we don’t use guests’ details for advertising.</P>

      <H2>Who else handles it</H2>
      <P>We use a small number of other companies to run the service. They only get what they need to do their job:</P>
      <List
        items={[
          'An SMS provider, to send and receive texts. It sees the guest’s mobile number and the text itself.',
          'Our hosting provider, which runs the site and stores its data. Some of this may be stored or processed outside Australia.',
          'A payment provider, which handles card payments. We never see or store your full card number.',
          'An email provider, to send sign-in links, receipts and (if you asked for them) planning tips.',
        ]}
      />

      <H2>Photos and files in your own storage</H2>
      <P>
        If the couple connects their own Google Drive, Dropbox or OneDrive, guests’ photos, documents and daily backups are saved straight into the couple’s account,
        in folders. Those files then belong to the couple and are covered by that provider’s own terms and privacy policy. We only ask for access to the folder the app
        uses, and the couple can disconnect it at any time.
      </P>

      <H2>How long we keep it</H2>
      <P>
        We keep a wedding’s information while the couple’s account is open. A couple can delete their wedding at any time, and we remove it from our systems within 90
        days (backups included). Guests can ask the couple, or us, to have their own details removed.
      </P>

      <H2>Keeping it safe</H2>
      <P>
        Each wedding is kept separate, and only the couple and the people they invite can see its guest list. Guests reach their invitation by a private link rather
        than a password. Connections to the site are encrypted. If there were ever a data breach likely to cause serious harm, we would tell the people affected and the
        Office of the Australian Information Commissioner.
      </P>

      <H2>Seeing, correcting or removing your information</H2>
      <P>
        Email us at <Email /> and we’ll reply within 30 days. If you’re not happy with how we’ve handled a privacy concern, you can contact the Office of the Australian
        Information Commissioner at oaic.gov.au.
      </P>
    </Shell>
  );
}

export function TermsPage() {
  return (
    <Shell title="Terms">
      <Updated />
      <P>
        These terms are between you and {BUSINESS}, which runs {BRAND}. By making an account you agree to them. We’ve kept them short and plain.
      </P>

      <H2>The service</H2>
      <P>
        {BRAND} helps you invite guests, collect replies and plan your wedding. We work hard to keep it running, but like any website it may sometimes be unavailable
        for a short time, for example during an update.
      </P>

      <H2>Paying</H2>
      <List
        items={[
          'Free costs nothing. Paid plans are a one-off payment per wedding, in Australian dollars with GST included. There is no subscription and nothing renews.',
          'Texts to guests are charged at cost, on top of your plan. You see how many will be sent and what they cost before anything goes out.',
          'Prices can change for new purchases, but never for a plan you’ve already paid for.',
        ]}
      />

      <H2>Refunds</H2>
      <P>
        If something isn’t right, tell us and we’ll try to fix it. If you change your mind before sending any invitations, ask within 14 days of paying for a full refund.
        Texts already sent can’t be refunded. Nothing here limits your rights under the Australian Consumer Law, including a refund or remedy if the service has a major
        problem.
      </P>

      <H2>Your guest list and your content</H2>
      <List
        items={[
          'What you put in (names, numbers, photos, wording) stays yours. You give us permission to store and use it only to run the service for you.',
          'Only add people you’re inviting, and only text people who would expect to hear from you about your wedding.',
          'Keep your passcode to yourselves, and only invite helpers you trust with your guest list.',
        ]}
      />

      <H2>Fair use</H2>
      <P>
        Please don’t use {BRAND} to send spam or anything unlawful or abusive, or try to get into other people’s weddings. We may close an account that does, and if it
        isn’t serious we’ll talk to you first.
      </P>

      <H2>Your own storage</H2>
      <P>
        If you connect Google Drive, Dropbox or OneDrive, files are saved into your account there. That provider’s terms apply to those files, and keeping enough
        space is up to you.
      </P>

      <H2>Our responsibility</H2>
      <P>
        We provide the service with care and skill. To the extent the law allows, we aren’t responsible for indirect losses, or for problems caused by things outside our
        control, such as a phone network or a storage provider being down. The Australian Consumer Law guarantees still apply in full.
      </P>

      <H2>Closing your account</H2>
      <P>
        You can delete your wedding at any time. We may close an account that breaks these terms. If we ever stop running {BRAND}, we’ll give you at least 60 days’
        notice so you can download everything.
      </P>

      <H2>Changes and questions</H2>
      <P>
        If we change these terms in a way that matters, we’ll email you first. These terms are governed by the law of [your state or territory], Australia. Questions? Email{' '}
        <Email />.
      </P>
    </Shell>
  );
}

export function ContactPage() {
  return (
    <Shell title="Contact">
      <P>The quickest way to reach us is by email. A real person reads every message, usually within one working day.</P>
      <p className="m-0 text-[22px]" style={{ fontFamily: serif }}>
        <Email />
      </p>
      <P>It helps if you include:</P>
      <List
        items={[
          'the email address you signed up with',
          'your wedding’s names (for example, Alex & Sam)',
          'what you were doing when something went wrong, and a screenshot if you can',
        ]}
      />
      <P>
        Are you a guest? The quickest answer is usually from the couple: reply to the text that brought you here, or use the message button on your invitation.
      </P>
      <P>
        Wedding vendor? You can <Link to="/vendors/join" style={{ color: INK }}>list your business free</Link>.
      </P>
    </Shell>
  );
}
