/**
 * Help: how to do each thing in the app, in a few steps. Shown in Account → Help (searchable, no AI
 * needed), and given to the planning assistant so it can answer "how do I…" questions from the same words.
 * `go` is where in the admin it happens: a tab, with a planner view or a page's view after "?".
 */
export interface HelpArticle {
  id: string;
  title: string;
  /** Section heading in the help page. */
  group: 'Getting started' | 'Guests and replies' | 'Planning' | 'On the day' | 'Your account';
  steps: string[];
  /** Other words people use for it. */
  also: string;
  go: { tab: string; event?: boolean; query?: string };
  /** A recorded walkthrough (a YouTube, Vimeo or Loom link, or an .mp4) when there is one; otherwise Help plays the animated one. */
  video?: string;
}

/**
 * What the walkthrough's phone shows for one step: the menu item lit up and the page's own tab (`at`), a
 * few rows of the page, fields being typed into, the button tapped, and what happens then.
 */
export interface HelpScene {
  at: string[];
  rows?: string[];
  fields?: [string, string][];
  tap?: string;
  then?: string;
}

/** Where the admin's menu calls each place, for the animated walkthrough. */
export const HELP_PLACES: Record<string, string> = {
  pages: 'Setup',
  guests: 'Guests',
  dietary: 'Dietary',
  seating: 'Seating',
  texts: 'Texts',
  messages: 'Messages',
  planner: 'Wedding planner',
  party: 'Wedding party',
  photos: 'Photos',
  settings: 'Settings',
};

/** The tour for someone new: the guides to play one after another. */
export const HELP_TOUR = ['start', 'guests', 'invitations', 'seating', 'budget', 'photos'];

/**
 * A recorded walkthrough's player address: YouTube (privacy-enhanced), Vimeo or Loom, set to play; a video
 * file plays as it is ('file'); anything else isn't shown.
 */
export function videoEmbed(url: string | undefined): { kind: 'frame' | 'file'; src: string } | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  const id = (re: RegExp, s: string) => re.exec(s)?.[1] ?? '';
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const v = u.searchParams.get('v') || id(/^\/(?:embed|shorts)\/([\w-]{6,})/, u.pathname);
    return /^[\w-]{6,20}$/.test(v) ? { kind: 'frame', src: `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&rel=0` } : null;
  }
  if (host === 'youtu.be') {
    const v = id(/^\/([\w-]{6,20})$/, u.pathname);
    return v ? { kind: 'frame', src: `https://www.youtube-nocookie.com/embed/${v}?autoplay=1&rel=0` } : null;
  }
  if (host === 'vimeo.com') {
    const v = id(/^\/(\d{5,12})$/, u.pathname);
    return v ? { kind: 'frame', src: `https://player.vimeo.com/video/${v}?autoplay=1` } : null;
  }
  if (host === 'loom.com') {
    const v = id(/^\/(?:share|embed)\/([0-9a-f]{16,40})$/, u.pathname);
    return v ? { kind: 'frame', src: `https://www.loom.com/embed/${v}?autoplay=1` } : null;
  }
  if (/\.(mp4|webm)$/i.test(u.pathname)) return { kind: 'file', src: u.toString() };
  return null;
}

export const HELP: HelpArticle[] = [
  {
    id: 'bestuse',
    title: 'Making the most of it: from now to the day',
    group: 'Getting started',
    steps: [
      'As soon as you’re engaged: add your events, set your budget, and open the Wedding planner’s checklist. It’s filled in already, month by month: add your own tasks and give each one to whoever is doing it (each of you, or a helper), so everyone has their own to-do list.',
      'Booking vendors: add each one in the planner’s Vendors with their quote. Drop in the quote or contract and its payment dates go into your payment schedule, with a nudge before each one is due. Tick them off as you pay.',
      'Guests: add or import everyone early, and give them groups (“Uni friends”, “Alex’s family”). Then connect your Google Drive once: photos, contracts and a daily backup are all filed there for you.',
      'Invitations: choose the look, Preview it, then switch on Texts. Replies, dietary needs and questions come back on their own. The Overview always shows what’s left to do, across everything.',
      'The last month: add the caterer’s special menus and give them to everyone who needs one, then Auto-seat (it follows your seating rules) and Publish. Fill in the night-before guide.',
      'On the day and after: guests get their table, meal and map the night before, and share photos by the QR code on each table. Everything stays in your Drive afterwards.',
    ],
    also: 'tips best way plan timeline overview how to use make the most guide start',
    go: { tab: 'planner', event: true },
  },
  {
    id: 'start',
    title: 'Getting set up',
    group: 'Getting started',
    steps: [
      'In Account → Overview, add your events (the wedding, welcome drinks, a recovery brunch) with their dates and venues.',
      'Open Setup in the wedding: your names, the details and the invitation.',
      'Choose a look for the invitation: colours, envelope and wording. Tap Preview to see exactly what guests will get.',
      'Add your guests (see “Adding guests”), then send the invitations from Texts.',
    ],
    also: 'begin first steps onboarding new',
    go: { tab: 'pages', event: true },
  },
  {
    id: 'guests',
    title: 'Adding guests',
    group: 'Guests and replies',
    steps: [
      'Open Guests. Tap Add guest for one household at a time: everyone on one invitation shares a link.',
      'Or import a spreadsheet: one row per invitation, with names, a mobile and which events they’re invited to.',
      'Group guests (e.g. “Alex’s side”) so seating and reminders can use them.',
    ],
    also: 'import invite list household plus one spreadsheet csv excel contacts',
    go: { tab: 'guests', event: true },
  },
  {
    id: 'invitations',
    title: 'Sending invitations and reminders',
    group: 'Guests and replies',
    steps: [
      'Open Texts. The invitation text goes to everyone with a mobile who hasn’t had it yet, on autopilot, once texting is set up (Account → Settings → Texting).',
      'Tap + Add a reminder for a gentle nudge to everyone still to reply, or + Last call before RSVPs close to schedule one a week before your reply-by date.',
      'Every text shows how many it goes to and what it costs before it’s sent. Send me a test sends it to your own mobile first.',
    ],
    also: 'rsvp sms text message remind nudge reply by deadline last call autopilot',
    go: { tab: 'texts', event: true },
  },
  {
    id: 'replies',
    title: 'Replies, questions and dietary needs',
    group: 'Guests and replies',
    steps: [
      'Guests reply on their own page or by texting YES or NO. Either way, it’s recorded straight away.',
      'Texts that mention a dietary need (“Sam is vegan”) are noted on that guest. Questions you’ve already answered in the night-before guide (time, place, parking, what to wear, your FAQ) are answered automatically.',
      'Anything else lands in Messages as unread: reply from there.',
    ],
    also: 'messages inbox answer question diet dietary allergy vegetarian vegan auto reply',
    go: { tab: 'messages' },
  },
  {
    id: 'dietary',
    title: 'Dietary requirements and meals',
    group: 'Guests and replies',
    steps: [
      'Open Guests → Dietary to see every need by guest, with serious allergies flagged and the kitchen’s counts (vegan, gluten free…).',
      'Under Menus, add each special menu your caterer offers (Vegan, Gluten free, Nut free) and write what it’s safe for. Say what the set menu is already safe for, too.',
      'Tap Give them their menus: everyone with a need gets the one menu that covers all of it (vegan and coeliac needs one marked both). Choose a menu, or change a course, for anyone yourself. Edit a menu and everyone on it changes too.',
      'Anything to check is flagged (a meal not marked safe for something they need). Download the caterer’s list: each person’s table, needs, menu and courses.',
    ],
    also: 'diet allergy allergies caterer meals menu menus special vegetarian vegan coeliac gluten nut assign',
    go: { tab: 'dietary', event: true },
  },
  {
    id: 'seating',
    title: 'Seating plan and versions',
    group: 'Planning',
    steps: [
      'Open Guests → Seating. + Add tables, then tap the plan to drop them; drag to move. Areas (dance floor, bar) come from + Add area.',
      'Tap a table, then tap names to seat them, or Auto-seat the rest: it follows your rules.',
      'Rules and checks: people invited together sit together, groups stay together, the wedding party goes to the head table, and tables fill before new ones start, all unless you turn them off. Add your own: keep two people apart, or together. Anything that breaks a rule is listed.',
      'Save seating as you go. Versions → Save as a version keeps a named copy (“Family draft”, “Final”); View any version, and Make current to switch.',
      'Publish when you’re ready: guests then see their table in their night-before guide.',
    ],
    also: 'tables seat chart floor plan version revision draft final publish rules apart together head table',
    go: { tab: 'seating', event: true },
  },
  {
    id: 'budget',
    title: 'Budget and payments',
    group: 'Planning',
    steps: [
      'Open Wedding planner → Money → Budget. Enter your total and guest count: it splits into the usual categories, per guest.',
      'Link each line to a vendor; booked vendors’ quotes become what you’ve committed.',
      'Money → Payments shows every deposit and instalment by due date. Tick one when it’s paid; reminders can come by text.',
    ],
    also: 'money cost spend deposit instalment due paid owing reminder',
    go: { tab: 'planner', event: true, query: 'view=budget' },
  },
  {
    id: 'vendors',
    title: 'Vendors and the directory',
    group: 'Planning',
    steps: [
      'Open Wedding planner → Vendors. Search the vendor directory near your venue, or add your own.',
      'The quote tracker shows who you’ve asked, who has quoted and who to chase.',
      'Save to phone contacts puts your booked vendors in your phone.',
    ],
    also: 'supplier florist photographer caterer venue directory contacts book booking',
    go: { tab: 'planner', event: true, query: 'view=vendors' },
  },
  {
    id: 'quotes',
    title: 'Getting quotes and comparing them',
    group: 'Planning',
    steps: [
      'In Vendors, tap + Request quotes. Pick the service: its usual items to price are filled in, ready to change.',
      'Tick who to ask, then check the email (a standard one for that service, ready to change).',
      'Send each vendor their email or text: each has a private link to price every item.',
      'Answers appear side by side, cheapest per item marked, totals evened out for what each left out. Book them closes the request.',
    ],
    also: 'quote request rfq tender price compare comparison email draft',
    go: { tab: 'planner', event: true, query: 'view=vendors' },
  },
  {
    id: 'checklist',
    title: 'Checklist and helpers',
    group: 'Planning',
    steps: [
      'Open Wedding planner → Checklist: the usual Australian plan counted back from your date, including the Notice of Intended Marriage.',
      'Give a task to a family member or friend: they get a private link to their own list and can mark it done.',
      'On the day checklists too (Wedding party → Your checklists, or another event’s Party checklist): tap a thing, then “Who’s doing it” to hand it to someone, or add someone new right there.',
      'On their page, “Add my jobs to my calendar” puts everything that’s theirs in their phone’s calendar, with reminders, and keeps it up to date.',
    ],
    also: 'to do todo tasks timeline helpers family jobs notice of intended marriage allocate assign hand over delegate day checklist calendar reminder',
    go: { tab: 'planner', event: true, query: 'view=checklist' },
  },
  {
    id: 'party',
    title: 'Your wedding party',
    group: 'Planning',
    steps: [
      'Open Wedding party. Under each side, tap + Add, choose their role and type their name: pick them from your guest list, or add someone new (they join the guest list too). In the guest list, a person’s “Wedding party” choice does the same.',
      'Links & sign-ins: send each their own sign-in, and choose what they can see (run sheet, to-dos, packing, speeches, guests).',
      'Write the run sheet and packing list once; each person sees only their part.',
    ],
    also: 'bridesmaids groomsmen best man maid of honour mc run sheet portal sign in password',
    go: { tab: 'party', event: true },
  },
  {
    id: 'drive',
    title: 'Connecting your Google Drive',
    group: 'Your account',
    steps: [
      'Open Photos and tap Connect Google Drive. Choose your Google account and allow access: the site can only see the folder it makes, nothing else in your Drive.',
      'Your “<your names> wedding” folder appears in your Drive with Photos (a folder per event), Planning files, Signs and print, and Backups. Photos already taken are copied straight away.',
      'If it ever says Needs reconnecting (a changed password), tap Reconnect with the same account: it carries on where it left off.',
    ],
    also: 'google drive connect link storage folder dropbox onedrive reconnect',
    go: { tab: 'photos', event: true },
  },
  {
    id: 'photos',
    title: 'Guests’ photos and the table QR code',
    group: 'On the day',
    steps: [
      'Open Photos → Photo settings, and connect your Google Drive, Dropbox or OneDrive: everything is filed there in folders.',
      'Print table numbers or Snap & share cards (Wedding planner → The day → Cards & signs): each has a QR code.',
      'Guests scan it, give their name, pick a frame, and take photos straight into your album. No app needed.',
    ],
    also: 'camera qr code album frames filters upload drive dropbox onedrive table cards',
    go: { tab: 'photos', event: true },
  },
  {
    id: 'guide',
    title: 'The night-before guide',
    group: 'On the day',
    steps: [
      'In Setup, open the Night-before page: add the run sheet, arrival time, parking, menu and your FAQ.',
      'The night before, every guest gets a text with their guide: their table, the menu and the map.',
      'Your FAQ is also how texted questions get answered automatically.',
    ],
    also: 'guide night before parking faq menu run sheet directions',
    go: { tab: 'pages', event: true },
  },
  {
    id: 'calendar',
    title: 'Calendars and phones',
    group: 'On the day',
    steps: [
      'Guests tap “All my events, kept up to date” on their invitation: their events go into their phone’s calendar and update themselves.',
      'In Wedding planner → Checklist, switch on your planning calendar: due tasks and payments appear in your own calendar.',
      'Install the admin on your phone: in your browser’s menu, choose Add to Home Screen.',
    ],
    also: 'calendar ical apple google outlook android iphone app install home screen',
    go: { tab: 'planner', event: true, query: 'view=checklist' },
  },
  {
    id: 'backup',
    title: 'Backups and keeping everything safe',
    group: 'Your account',
    steps: [
      'Connect your Google Drive, Dropbox or OneDrive (Photos → Photo settings). A full backup goes to its Backups folder every day.',
      'Account → Settings → Backup: Back up now, or download everything as one file.',
      'Each wedding is kept completely separate; only people you invite can see yours.',
    ],
    also: 'backup safe security privacy download export lost data',
    go: { tab: 'settings', query: 'view=backup' },
  },
  {
    id: 'helpers',
    title: 'Sharing the admin with your partner or planner',
    group: 'Your account',
    steps: [
      'Account → Settings: invite someone by email as an owner, editor (can change things) or viewer (can look).',
      'They set their own passcode. Remove them any time and they’re signed out at once.',
    ],
    also: 'partner planner share invite member access editor viewer owner',
    go: { tab: 'settings', query: 'view=wedding' },
  },
];

/** One scene per step of each guide (same order as its steps), for the walkthroughs. */
export const HELP_SCENES: Record<string, HelpScene[]> = {
  bestuse: [
    { at: ['Wedding planner', 'Checklist'], rows: ['Book the venue · Alex', 'Choose photographer · Sam', 'Order invitations · Mum'], tap: '+ Add a task', then: 'Everyone has their own to-do list ✓' },
    { at: ['Wedding planner', 'Vendors'], rows: ['The Boathouse · quote $14,000', 'Deposit $4,000 · due 1 Mar'], tap: 'Add their quote', then: 'Payments added to your schedule ✓' },
    { at: ['Guest list'], rows: ['Uni friends · 14', 'Alex’s family · 22'], tap: 'Connect Google Drive', then: 'Everything filed in your Drive ✓' },
    { at: ['Texts'], rows: ['The invitation · on autopilot', 'Replies: 84 of 112'], tap: 'Switch on', then: 'Replies come back on their own' },
    { at: ['Guest list', 'Seating'], rows: ['Rules: invited together sit together ✓', 'Ben ≠ Lou'], tap: 'Auto-seat the rest', then: 'Seated, every rule kept ✓' },
    { at: ['Guest’s phone'], rows: ['Table 4 · next to the dance floor', 'Your meal: Vegan menu'], then: 'Their table, meal and map, the night before' },
  ],
  start: [
    { at: ['Overview', 'Your events'], rows: ['The wedding · Sat 14 Mar'], fields: [['Event', 'Welcome drinks'], ['Date', 'Fri 13 Mar, 6:00pm'], ['Venue', 'The Boathouse']], tap: '+ Add an event', then: 'Welcome drinks added ✓' },
    { at: ['Setup', 'Invitation'], fields: [['Your names', 'Alex & Sam'], ['Reply by', '1 February']], tap: 'Save', then: 'Saved: guests see it now ✓' },
    { at: ['Setup', 'Look and feel'], rows: ['Classic Ivory & Gold', 'Rustic Eucalyptus ✓', 'Navy & Gold'], tap: 'Preview', then: 'The envelope opens, just as guests see it' },
    { at: ['Guest list'], rows: ['Jordan & Casey · 2', 'The Nguyens · 4', 'Priya · 1'], tap: 'Texts', then: 'Invitations go out on autopilot' },
  ],
  guests: [
    { at: ['Guest list'], fields: [['Main contact', 'Jordan Lee'], ['Their mobile', '0412 345 678'], ['Also on the invitation', 'Casey Lee']], tap: '+ Add guest', then: 'Jordan & Casey added ✓' },
    { at: ['Guest list'], rows: ['guests.xlsx · 86 rows', '84 to add · 2 already on your list'], tap: 'Import a spreadsheet', then: '84 invitations added ✓' },
    { at: ['Guest list'], fields: [['Group', 'Alex’s side']], rows: ['Jordan & Casey', 'The Nguyens'], tap: 'Save', then: 'Seating and reminders can use the group' },
  ],
  invitations: [
    { at: ['Texts'], rows: ['The invitation · on autopilot', 'Goes to 112 with a mobile', 'Not sent yet: 112'], tap: 'Switch on', then: 'Sending from 9am tomorrow ✓' },
    { at: ['Texts'], rows: ['Still to reply: 38'], fields: [['Reminder', 'Just a gentle nudge to reply by 1 Feb…']], tap: '+ Last call before RSVPs close', then: 'Scheduled for 25 January ✓' },
    { at: ['Texts'], rows: ['Goes to 38 people', 'Costs about $1.90'], tap: 'Send me a test', then: 'Sent to your mobile ✓' },
  ],
  replies: [
    { at: ['Guest list'], rows: ['Jordan & Casey · Coming ✓ 2', 'The Nguyens · Can’t make it', 'Priya · Awaiting reply'], then: 'Replies are recorded straight away' },
    { at: ['Messages'], rows: ['Priya: “Sam is vegan”', '→ Dietary noted on Sam ✓', 'Ben: “What time does it start?”', '→ Answered from your guide ✓'], then: 'Answered for you, automatically' },
    { at: ['Messages'], rows: ['Lou: “Can I bring my baby?” · unread'], fields: [['Your reply', 'Of course! We’ll add a high chair.']], tap: 'Send', then: 'Sent ✓' },
  ],
  dietary: [
    { at: ['Guest list', 'Dietary'], rows: ['Sam · Vegan', 'Ben · Coeliac ⚠ serious', 'Lou · No seafood'], then: 'Serious allergies are flagged' },
    { at: ['Guest list', 'Dietary'], fields: [['Menu', 'Vegan and gluten free'], ['Safe for', 'vegan, gluten free, nut free']], tap: '+ Add a special menu', then: 'Menu added ✓' },
    { at: ['Guest list', 'Dietary'], rows: ['Sam · Vegan → Vegan', 'Ben · Coeliac → Gluten free'], tap: 'Give them their menus', then: '2 guests have their menu ✓' },
    { at: ['Guest list', 'Dietary'], rows: ['⚠ Lou · Set menu isn’t marked nut free', 'Meals: 11 of 12 sorted'], tap: 'Download the caterer’s list', then: 'Downloaded ✓' },
  ],
  seating: [
    { at: ['Guest list', 'Seating'], rows: ['Room plan'], tap: '+ Add tables', then: 'Tap the plan to drop each table' },
    { at: ['Guest list', 'Seating'], rows: ['Table 3 · 6 of 10', 'Jordan & Casey', 'The Nguyens'], tap: 'Auto-seat the rest', then: 'Everyone seated, households together ✓' },
    { at: ['Guest list', 'Seating'], rows: ['✓ People invited together sit together', '✓ Wedding party at the head table', 'Ben ≠ Lou (keep apart)'], tap: '+ Add rule', then: 'All good ✓' },
    { at: ['Guest list', 'Seating'], fields: [['Version name', 'Family draft']], tap: 'Save as a version', then: 'Kept: make it current any time ✓' },
    { at: ['Guest list', 'Seating'], rows: ['Final · current'], tap: 'Publish', then: 'Guests see their table in their guide ✓' },
  ],
  budget: [
    { at: ['Wedding planner', 'Money'], fields: [['Your budget', '$35,000'], ['Guests', '110']], tap: 'Save', then: 'Split into the usual categories, per guest ✓' },
    { at: ['Wedding planner', 'Money'], rows: ['Venue · $14,000 · Linked to The Boathouse', 'Flowers · $3,500'], tap: 'Link a vendor', then: 'Booked quotes count as committed' },
    { at: ['Wedding planner', 'Money'], rows: ['Venue deposit · $4,000 · due 1 Mar', 'Florist balance · $1,750 · due 1 Oct'], tap: 'Paid', then: 'Marked paid ✓' },
  ],
  vendors: [
    { at: ['Wedding planner', 'Vendors'], fields: [['Looking for', 'Florists'], ['Within', '25 km']], tap: 'Search', then: '6 listed florists near your venue' },
    { at: ['Wedding planner', 'Vendors'], rows: ['Wildflower Studio · Quoted $2,800', 'Petal Co · Asked 3 days ago', 'Bloom House · Chase them'], then: 'Who to chase, at a glance' },
    { at: ['Wedding planner', 'Vendors'], rows: ['5 booked vendors'], tap: 'Save to phone contacts', then: 'In your phone’s contacts ✓' },
  ],
  quotes: [
    { at: ['Wedding planner', 'Vendors'], fields: [['Service', 'Florist']], rows: ['Bridal bouquet', 'Table centres × 12', 'Arbour flowers'], tap: '+ Request quotes', then: 'Usual items filled in' },
    { at: ['Wedding planner', 'Vendors'], rows: ['☑ Wildflower Studio', '☑ Petal Co', '☐ Bloom House'], tap: 'Check the email', then: 'A standard email, ready to change' },
    { at: ['Wedding planner', 'Vendors'], rows: ['Wildflower Studio · their own link', 'Petal Co · their own link'], tap: 'Send', then: 'Each prices every item on their link' },
    { at: ['Wedding planner', 'Vendors'], rows: ['Wildflower $2,800 · cheapest bouquet', 'Petal Co $3,150'], tap: 'Book them', then: 'Booked, and the request closes ✓' },
  ],
  checklist: [
    { at: ['Wedding planner', 'Checklist'], rows: ['Book the venue · 12 months', 'Notice of Intended Marriage ⚠ by 14 Feb', 'Send invitations · 3 months'], then: 'Counted back from your date' },
    { at: ['Wedding planner', 'Checklist'], fields: [['Who?', 'Mum']], rows: ['Order the cake'], tap: 'Copy their link', then: 'Mum ticks it off on her phone' },
    { at: ['Wedding party', 'Your checklists'], rows: ['Collect the rings · 10:30am'], fields: [['Who’s doing it', 'Jess (best man)']], tap: 'Send them their link', then: 'On Jess’s list and calendar ✓' },
    { at: ['Their page'], rows: ['Collect the rings · 10:30am', 'Order the cake · 2 weeks before'], tap: 'Add my jobs to my calendar', then: 'In their calendar, with reminders ✓' },
  ],
  party: [
    { at: ['Wedding party', 'Overview'], fields: [['Role', 'Groomsman'], ['Name', 'Riley Chen'], ['Mobile', '0423 456 789']], tap: '+ Add Riley Chen as a groomsman', then: 'In the party and on your guest list ✓' },
    { at: ['Wedding party', 'Links & sign-ins'], rows: ['☑ Run sheet', '☑ Their to-dos', '☑ Packing', '☐ The guest list'], tap: 'Text their sign-in', then: 'Riley has their own sign-in ✓' },
    { at: ['Wedding party', 'Run sheet'], rows: ['8:00am · Breakfast together · Everyone', '1:30pm · Photos · Groom’s side', '3:00pm · Ceremony · Everyone'], tap: 'See it as: Riley', then: 'Exactly what Riley sees' },
  ],
  drive: [
    { at: ['Photos'], rows: ['Your own Google Drive'], tap: 'Connect Google Drive', then: 'Google asks which account' },
    { at: ['Photos'], rows: ['✓ Connected to Google Drive', 'Alex & Sam wedding › Photos, Planning files, Backups'], tap: 'Open in Google Drive', then: 'Your folders, in your Drive ✓' },
    { at: ['Photos'], rows: ['⚠ Google Drive needs reconnecting'], tap: 'Reconnect', then: 'Carries on where it left off ✓' },
  ],
  photos: [
    { at: ['Photos', 'Photo settings'], rows: ['Google Drive', 'Dropbox', 'OneDrive'], tap: 'Connect Google Drive', then: '“Alex & Sam wedding” folder made ✓' },
    { at: ['Wedding planner', 'The day'], rows: ['Table numbers · with QR code', 'Snap & share cards'], tap: 'Print', then: 'Each card has your QR code' },
    { at: ['Guest’s phone'], fields: [['Your name', 'Priya']], rows: ['Frame: Polaroid'], tap: 'Take a photo', then: 'In your album and your Drive ✓' },
  ],
  guide: [
    { at: ['Setup', 'Night-before'], fields: [['Arrive by', '2:30pm'], ['Parking', 'Free, beside the lawn']], rows: ['Run sheet', 'Menu', 'Your FAQ'], tap: 'Save', then: 'Saved ✓' },
    { at: ['Texts'], rows: ['The night before · 6:00pm', 'Goes to everyone coming: 96'], then: 'Each gets their table, the menu and the map' },
    { at: ['Setup', 'Night-before'], fields: [['Question', 'What should I wear?'], ['Answer', 'Cocktail: flats suit the grass']], tap: 'Save', then: 'Texted questions answered from this ✓' },
  ],
  calendar: [
    { at: ['Guest’s invitation'], rows: ['Add to calendar'], tap: 'All my events, kept up to date', then: 'In their calendar, updating itself ✓' },
    { at: ['Wedding planner', 'Checklist'], rows: ['Due tasks and payments'], tap: 'Switch on my planning calendar', then: 'In your calendar ✓' },
    { at: ['Your browser’s menu'], rows: ['Share', 'Add to Home Screen'], tap: 'Add to Home Screen', then: 'Opens like an app ✓' },
  ],
  backup: [
    { at: ['Photos', 'Photo settings'], tap: 'Connect Dropbox', then: 'A backup goes to Backups every day ✓' },
    { at: ['Settings', 'Backup'], rows: ['Last backup: today, 3:02am'], tap: 'Back up now', then: 'Backed up ✓' },
    { at: ['Settings', 'System check'], rows: ['✓ Texts', '✓ Dropbox', '✓ Daily backups'], tap: 'Check again', then: 'Everything working ✓' },
  ],
  helpers: [
    { at: ['Settings', 'Who can sign in'], fields: [['Their email', 'sam@example.com'], ['They can', 'Change things (editor)']], tap: 'Invite', then: 'Invite sent ✓' },
    { at: ['Settings', 'Who can sign in'], rows: ['Sam · editor', 'Planner Kate · viewer'], tap: 'Remove', then: 'Signed out at once ✓' },
  ],
};

/** Words that say nothing about what someone wants to do. */
const FILLER = new Set(['how', 'what', 'where', 'when', 'who', 'why', 'can', 'are', 'our', 'the', 'and', 'for', 'you', 'your', 'with', 'does', 'did', 'get', 'want', 'need', 'from', 'this', 'that', 'there', 'into', 'have', 'has', 'all', 'any', 'out']);

/** The help articles that best match a question, best first (empty when nothing fits). */
export function searchHelp(q: string, limit = 3): HelpArticle[] {
  const words = (q.toLowerCase().match(/[a-z]{3,}/g) ?? []).filter((w) => !FILLER.has(w));
  if (!words.length) return [];
  const scored = HELP.map((a) => {
    const title = a.title.toLowerCase();
    const body = `${a.also} ${a.steps.join(' ')}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      const stem = w.replace(/(ing|s|es|ed)$/, '');
      if (stem.length < 3) continue;
      // Whole words (a stem may end early: "backups" finds "backup"), never the middle of one ("our" in "your").
      const re = new RegExp(`\\b${stem}`);
      if (re.test(title)) score += 3;
      else if (re.test(a.also)) score += 2;
      else if (re.test(body)) score += 1;
    }
    return { a, score };
  });
  return scored
    .filter((x) => x.score >= 2)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}
