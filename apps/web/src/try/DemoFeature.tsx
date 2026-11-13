import { PLAN_INFO } from '@wp/shared';
import { Link } from 'react-router-dom';

/**
 * Try the app: the parts of the admin the sample doesn't run, shown as a clear card of what each does and
 * which plan has it (never an error). Guests, dietary needs and seating are the hands-on parts.
 */
const FEATURES: Record<string, { title: string; plan: 'free' | 'essentials' | 'complete'; points: string[] }> = {
  messages: {
    title: 'Messages',
    plan: 'free',
    points: ['Every reply and question from your guests in one inbox, by text or email', 'Questions you’ve answered in your guide are answered for you', 'Reply from your phone in a tap'],
  },
  pages: {
    title: 'Your invitation and pages',
    plan: 'free',
    points: ['Choose a design and a look, your colours and lettering, the wax seal and envelope', 'Your words on every page: the day, travel, the dress code, the registry, your FAQ', 'Preview exactly what each guest sees before anything goes out'],
  },
  texts: {
    title: 'Texts',
    plan: 'essentials',
    points: ['Invitations, gentle reminders to anyone still to reply, a thank-you and the night-before guide', 'Each guest gets their own link; see who it goes to and the cost before it sends', 'Send from your own phone for free, or let us text them (8c a credit)'],
  },
  photos: {
    title: 'Guests’ photos',
    plan: 'complete',
    points: ['A QR code on each table: guests add their photos and videos from their phones', 'A live photo wall for the reception', 'Everything saved to your own Google Drive, Dropbox or OneDrive'],
  },
  party: {
    title: 'Wedding party',
    plan: 'essentials',
    points: ['Your bridesmaids, groomsmen, MC and family in one place, each with their own sign-in', 'Their own run sheet for the day, what to bring, and who to call', 'Join emails sent for you, with your details'],
  },
  planner: {
    title: 'Planner',
    plan: 'essentials',
    points: ['A month-by-month checklist that’s already filled in', 'Budget and payments, with reminders before each one is due', 'Vendors: quotes side by side, contracts, arrival times and a contact sheet for the day'],
  },
  day: {
    title: 'The day',
    plan: 'essentials',
    points: ['Your checklist for the last month, the week and the day', 'The run sheet everyone works from', 'Nothing forgotten on the morning'],
  },
  settings: {
    title: 'Settings',
    plan: 'free',
    points: ['Add your partner or a helper, each with their own sign-in', 'How messages go: free from your own phone or by email, or texts', 'Keep it private: pages open only with each guest’s own link'],
  },
  rehearsal: {
    title: 'Rehearse your day',
    plan: 'essentials',
    points: ['Run the whole wedding with your real guest list before it happens', 'Every text, each guest’s page and anything that would go wrong', 'Nothing is sent'],
  },
};
export const DEMO_HANDS_ON = new Set(['overview', 'guests', 'dietary', 'seating', 'help']);

export function DemoFeature({ tab }: { tab: string }) {
  const f = FEATURES[tab] ?? FEATURES.planner!;
  return (
    <section aria-label={`${f.title} in the sample`} className="flex flex-col gap-4 max-w-[620px]">
      <h1 className="m-0 font-display font-medium text-[clamp(30px,8vw,40px)] leading-[1.08]">{f.title}</h1>
      <span className="self-start py-1 px-3 rounded-full text-[12px] font-semibold tracking-[.06em] bg-[#f3ecd9] text-[#6b5320]">
        {f.plan === 'free' ? 'On every plan' : `${PLAN_INFO[f.plan].name}${f.plan === 'essentials' ? ' and Deluxe' : ''}`}
      </span>
      <ul className="m-0 pl-5 flex flex-col gap-2 text-[16px] leading-[1.5]">
        {f.points.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="p-4 rounded-[14px] border border-[#ecdcd2] bg-[#fbf8f2] text-[14px] text-[#6e6068]">
        The sample lets you try your guest list, dietary needs and seating hands-on. This part works with your own wedding: start one free, set everything up, and only pay when you’re ready to send.
      </div>
      <div className="flex flex-wrap gap-2">
        <a href="/#start" className="py-3 px-6 rounded-full no-underline text-[15px] font-semibold" style={{ background: '#3a2532', color: '#fbf8f2' }}>
          Start your wedding
        </a>
        <Link to="/admin/demo/wedding/seating" className="py-3 px-6 rounded-full no-underline text-[15px] border border-[#e3cfc6] text-[#3a2532]">
          Try the seating plan
        </Link>
      </div>
    </section>
  );
}
