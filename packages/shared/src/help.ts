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
  rehearsal: 'Rehearsal',
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
    also: 'begin first steps onboarding new invitation design look wording words change edit colours envelope template theme photo music',
    go: { tab: 'pages', event: true },
  },
  {
    id: 'seal',
    title: 'Your wax seal and envelope',
    group: 'Getting started',
    steps: [
      'Open Setup → Invitation → Extras → Envelope and seal (or step 3, Envelope & seal, of Design it your way). A small envelope shows your choice as it is now.',
      'Pick the wax colour: Sandstone, dusty rose, Daphne blue, rose gold, gold, silver, champagne, pearl white, burgundy, forest green, sage, navy, black, terracotta or lilac. Then the seal design: classic initials, a floral emboss, initials in a wreath, a single initial, a heart, or your wedding date (like 20.03.27).',
      'Choose script or serif capitals for the letters, or type your own words for the seal (up to 12, e.g. one initial or “2027”); empty, it shows the initials from your monogram.',
      'Pick the envelope colour: cream, ivory, champagne, blush pink, dusty rose, sage, eucalyptus, dusty blue, navy, midnight black, terracotta or kraft (or your look’s own), plus the liner and ribbon. The preview follows as it saves: tap the envelope to watch it open.',
    ],
    also: 'wax seal stamp initials monogram letters emboss floral wreath heart date script serif rose gold silver champagne pearl burgundy navy black envelope colour color paper kraft blush cream ivory sage liner ribbon',
    go: { tab: 'pages', event: true },
  },
  {
    id: 'guests',
    title: 'Adding guests',
    group: 'Guests and replies',
    steps: [
      'Open Guests. Tap Add guest for one household at a time: their details open straight away, invited to every event (untick any they’re not coming to), and everyone on one invitation shares a link. Tick Child for any child on it (everyone else counts as an adult). A guest left blank isn’t kept. On a phone, slide a guest to the left to delete them. The banner at the top lists anyone missing a mobile, email or address for how their invitation goes: tap it to see who.',
      'Or import a spreadsheet: one row per invitation, with names, a mobile and which events they’re invited to. Or Import contacts: From this phone (Android), From my contacts on iPhone (tap Name, then AutoFill Contact above the keyboard, pick someone, Add, repeat), or From a contacts file (.vcf or .csv) for many at once. Tick who to add, then Add. Postal addresses come too: set Invitation by to Printed for a posted invitation (post only means no texts or emails), and print Address labels.',
      'Say who each guest is to you, for seating: whose side (yours, your partner’s or both), how they know you (immediate or extended family, school, uni or childhood friend, sport or club, work or ex-work colleague, neighbour, plus-one) and their circles, who they know (“Uni crew”, “Acme work”, “Netball”). Set it on the guest, or import Side, Relationship and Circles (or Knows) columns. Groups (e.g. “Alex’s side”) still work too.',
      'Many at once: tap Select, tick guests (or Tick everyone shown), and set their side, how they know you, how their invitation goes, or add or take off a circle in one go. They show as chips on the list; filter by side, relationship or circle, or tap Group by side to list the bride’s side, then the groom’s.',
    ],
    also: 'import invite list household plus one spreadsheet csv excel contacts side relationship relation circle circles who knows who bulk select tick colleague family friend',
    go: { tab: 'guests', event: true },
  },
  {
    id: 'invitations',
    title: 'Sending invitations and reminders',
    group: 'Guests and replies',
    steps: [
      'Open Texts. Choose how your messages go first (Account → Settings → Texting): from your own phone (free), by email (free) or a texting number (paid). From your own phone, invitations and reminders wait as “ready to send from your phone”: each tap opens your Messages app with that guest’s number and message (never a group text), then Sent, next. Replies come to your phone; record one on the guest’s page in a tap.',
      'Tap + Add a reminder for a gentle nudge to everyone still to reply, or + Last call before RSVPs close to schedule one a week before your reply-by date.',
      'Every text shows how many it goes to and what it costs before it’s sent. Send me a test sends exactly what a guest gets (filled in with a sample guest, marked TEST) to your own mobile, from your own phone, or to your email; with nothing connected it shows the preview and what to set up. Tests never count against guests or the day’s limits.',
    ],
    also: 'rsvp sms text message remind nudge reply by deadline last call autopilot own phone my phone free imessage messages app email replied hasn’t haven’t not yet waiting outstanding chase test try sample',
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
      'Open Guests → Seating and tap Edit seating. The tools come in three tabs: Seat guests, Tables and Room. The two of you are already on the list to seat: no need to add yourselves as guests.',
      'Room: choose the room’s shape and size, or Exact size in metres for your venue’s real size. + Add area for the dance floor, bar and so on; tap an area to set its width and depth in metres.',
      'Tables: + Add tables, then tap the plan to drop them; drag to move. Tap a table to set its seats, type and size in metres (its diameter or length).',
      'Seat guests: tap a table, then tap names to seat them, or Auto-seat the rest: it follows your rules. Tap a table to open it big, with each name beside its chair; tap a chair to choose who sits there (taking someone’s seat swaps them), and change the chairs there too: One seat more or fewer, the table type, and which sides have chairs. Back to the room shrinks it again. Guests’ guides then say their table and seat.',
      'Start with a concept plan before the invitations go out: everyone on your list can be placed (shown lighter, “Not replied yet”). The top of Seating shows the stage (Concept plan → Replies coming in → Final → Published) and the one next step. As replies arrive nothing moves: yeses are confirmed, anyone who can’t come frees their seat, and “Since your last save” lists who said yes, who can’t come and who’s new, with Fill gaps with auto-seat.',
      'Rules and checks: people invited together sit together, groups and circles stay together (same or neighbouring tables), the wedding party goes to the head table, family sit near it, colleagues together, and tables fill before new ones start, all unless you turn them off. Choose to mix the two sides or keep them together. Add your own: keep two people apart or together, say two people know each other (they share a circle), or mark someone who knows no one. Anything that breaks a rule is listed.',
      'Suggest a plan from who knows who: a whole new arrangement, saved as its own version (“Who knows who — Sat 9 Nov”), never over your current plan. Biggest circles first, households together, family near the head table, your sides choice and every rule kept, with pencilled-in guests too when you’re seating everyone invited. It says how it compares (“keeps 18 of 20 circles together, 3 people alone at their table → 0”): Make this current, or Discard.',
      'Save seating as you go, and keep a named version at each stage (it suggests “Concept plan”, “After replies”, “Final”): Versions → View any of them, and Make current to switch back.',
      'Publish when you’re ready: guests then see their table in their night-before guide. Only people who said yes are shown, so nobody sees a pencilled-in table mate who may not come; publish again as more say yes.',
    ],
    also: 'tables seat chair exact seat number swap metres meters dimensions size scale dance floor seat chart floor plan version revision draft concept final publish rules apart together head table pencil pencilled pending not replied stage who knows who circles suggest alternative sides mix family colleagues know each other',
    go: { tab: 'seating', event: true },
  },
  {
    id: 'budget',
    title: 'Budget and payments',
    group: 'Planning',
    steps: [
      'Open Wedding planner → Money → Budget. Enter your total and guest count: it splits into the usual categories, per guest.',
      'Link each line to a vendor; booked vendors’ quotes become what you’ve committed.',
      'Money → Payments shows every deposit and instalment by due date. Tick one when it’s paid; reminders go in your phone’s calendar.',
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
    title: 'Vendors: add, get quotes, compare, lock in, manage',
    group: 'Planning',
    steps: [
      'Step 1, Add vendors: in Wedding planner → Vendors tap + Add a vendor for each one you’re thinking of (their name, what they do, an email or mobile). Ideas? Browse the vendor directory.',
      'Step 2, Get quotes: tap + Get quotes, tap what for, and Send. Each vendor prices it on their own link or attaches their own quote; slow ones are reminded automatically. Already have quotes? + Enter myself, and type them in.',
      'Step 3, Compare: best value first, like for like, with star ratings. Tap Ask for a better price for a plan for your favourite: what to aim for, the levers, and messages ready to send.',
      'Step 4, Lock in: book your favourite, put them on their budget line (budgeted against booked), enter each payment (or tap a layout such as deposit + 3 monthly), sign the contract, and add meals for their team: your caterer sees them all.',
      'Step 5, Manage, where you’ll spend most of your time: what needs you (payments due, with Mark paid; tasks due; check-ins), and each vendor’s tasks (the usual ones for their kind in a tap: the shot list, final numbers…), notes of calls, payments, files, the final check-in three weeks out, and the day’s contact sheet to print. Payment reminders go in your phone’s calendar.',
    ],
    also: 'quote request rfq tender price compare comparison email draft manual enter type in myself negotiate discount better deal haggle book lock in deposit contract vendor meals caterer payment schedule add vendor',
    go: { tab: 'planner', event: true, query: 'view=vendors' },
  },
  {
    id: 'checklist',
    title: 'Checklist and helpers',
    group: 'Planning',
    steps: [
      'Open Wedding planner → Checklist: the usual Australian plan counted back from your date, including the Notice of Intended Marriage.',
      'Give a task to a family member or friend: they get a private link to their own list and can mark it done.',
      'The last month and the day itself are in the same checklist (another event has its own Party checklist): tap a thing, then “Who’s doing it” to hand it to someone, or add someone new right there.',
      'On their page, “Add my jobs to my calendar” puts everything that’s theirs in their phone’s calendar, with reminders, and keeps it up to date.',
    ],
    also: 'to do todo tasks timeline helpers family jobs notice of intended marriage allocate assign hand over delegate day checklist calendar reminder',
    go: { tab: 'planner', event: true, query: 'view=checklist' },
  },
  {
    id: 'ceremony',
    title: 'Your ceremony and the legal paperwork',
    group: 'Planning',
    steps: [
      'Open Wedding planner → Ceremony. Invite your celebrant in Settings and choose “Celebrant” for who they are: the ceremony is the first thing they see, and they can work on it with you.',
      'Questionnaires: your celebrant attaches theirs (a PDF, Word document or photo) or asks the questions here. Start with “Getting to know you”. You each answer on your own, then tick yours ready for the celebrant.',
      'Legal paperwork: the Notice of Intended Marriage must reach your celebrant at least one month, and no more than 18 months, before the day. Your first and last dates are worked out for you; tick off each document as the celebrant sees it.',
      'On the day: two witnesses over 18 and the three marriage certificates. Afterwards your celebrant registers the marriage within 14 days, and you apply to your state’s registry for the official certificate. It’s a guide: your celebrant confirms what you need.',
      'The ceremony: your celebrant’s details, the order, readings, music and your vows. Tick Private on your vows and only you see them.',
    ],
    also: 'celebrant ceremony questionnaire noim notice of intended marriage paperwork legal documents birth certificate passport divorce witnesses certificate declaration no legal impediment vows readings order of service births deaths marriages bdm registry',
    go: { tab: 'planner', event: true, query: 'view=ceremony' },
  },
  {
    id: 'party',
    title: 'Your wedding party: bridesmaids, groomsmen and MC',
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
    id: 'text-credits',
    title: 'What texts cost (they’re not included in your plan)',
    group: 'Your account',
    steps: [
      'Texts aren’t included in any plan. Sending from your own phone or by email is always free; automatic texts need text credits, which you buy separately.',
      'Open Settings → Texting, and type how many guests you’ll text. It works out the credits (up to 13 for each guest’s mobile if you send every text: save the date, invitation, two reminders, RSVP thank-you, night before and thank-you after; each with its link is 2 credits) and shows the total, all-in: 8c a credit, GST included, no other fees. A couple on one invitation share one mobile.',
      'Tap Buy and pay by card. The credits are added straight away and never expire. When they run out, automatic texts stop until you buy more: nothing is charged without you choosing to.',
    ],
    also: 'sms text cost price credits buy texts top up how much are texts included extra fee service fee charge per text money',
    go: { tab: 'settings', query: 'view=texting' },
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
    also: 'camera qr code album frames filters upload drive dropbox onedrive table cards print printing place cards signs welcome sign menu cards',
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
    id: 'rehearsal',
    title: 'Rehearse your wedding day',
    group: 'On the day',
    steps: [
      'Tap Rehearse your wedding day on the Overview (or Take me there below). It runs your whole wedding as a dry run on your real guests, words and settings. Nothing is sent and nothing is saved.',
      'The Rehearsal checklist shows each area in green, amber or red: texts, replies, seating, the night before, the day, photos and the wedding party. Tap Fix it beside anything that would go wrong.',
      'Move along the timeline, or tap a moment: invitations out, replies coming in, reminders, replies close, final seating, the night before, the morning, the ceremony, the reception and the day after.',
      'At each moment you see every message that goes out, in its real words. Choose Said yes, Said no or Not replied to see what that guest gets, and their page as it looks then: their table, meal, night-before guide and photo page.',
      'It shows what the wedding party and your coordinator see, too. Run it again after each fix until it’s all green, then use Send me a test in Texts to get a real one on your own phone.',
    ],
    also: 'rehearse rehearsal dry run practice simulate simulation trial run preview check ready readiness d-day day of what happens happen what will guests see go wrong break timeline before the day final check',
    go: { tab: 'rehearsal' },
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
    { at: ['Guest list'], fields: [['Side', 'Alex’s side'], ['How they know you', 'Uni friend'], ['Circles', 'Uni crew']], tap: 'Save', then: 'Seating knows who knows who ✓' },
    { at: ['Guest list'], rows: ['☑ Jordan & Casey', '☑ The Nguyens', '☑ Priya'], fields: [['Add a circle', 'Netball']], tap: 'Set for 3 guests', then: 'Saved for 3 guests ✓' },
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
    { at: ['Guest list', 'Seating'], rows: ['Seat guests · Tables · Room'], tap: 'Edit seating', then: 'Three tabs of tools' },
    { at: ['Guest list', 'Seating', 'Room'], fields: [['Size', 'Exact size in metres'], ['Width (m)', '24'], ['Depth (m)', '18']], tap: '+ Add area', then: 'Dance floor 6 × 6 m, to scale ✓' },
    { at: ['Guest list', 'Seating', 'Tables'], fields: [['Seats', '10'], ['Diameter (m)', '1.8']], tap: '+ Add tables', then: 'Tap the plan to drop each table' },
    { at: ['Guest list', 'Seating', 'Seat guests'], rows: ['Table 3 · 6 of 10', 'Seat 1 · Jordan', 'Seat 2 · Casey'], tap: 'Auto-seat the rest', then: 'Pick any guest’s exact seat ✓' },
    { at: ['Guest list', 'Seating'], rows: ['Concept plan → Replies coming in', 'Since your last save: 3 said yes · 2 can’t come'], tap: 'Fill gaps with auto-seat', then: 'Everyone else stays put ✓' },
    { at: ['Guest list', 'Seating'], rows: ['✓ People invited together sit together', '✓ Keep circles together', 'Ben ≠ Lou (keep apart)'], tap: '+ Add rule', then: 'All good ✓' },
    { at: ['Guest list', 'Seating'], rows: ['Who knows who — Sat 9 Nov', 'Keeps 18 of 20 circles together (now 12)', '3 people alone at their table → 0'], tap: 'Make this current', then: 'Seated by who knows who ✓' },
    { at: ['Guest list', 'Seating'], fields: [['Version name', 'Concept plan']], tap: 'Save as a version', then: 'Kept: make it current any time ✓' },
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
    { at: ['Wedding planner', 'Vendors'], fields: [['Name', 'Wildflower Studio'], ['What they do', 'Florist'], ['Email', 'hello@wildflower.com.au']], tap: '+ Add a vendor', then: 'Step 1 ✓ Added' },
    { at: ['Wedding planner', 'Vendors'], rows: ['☑ Wildflower Studio', '☑ Petal Co', '☐ Bloom House'], tap: 'Send to 2 vendors', then: 'Each prices it on their own link' },
    { at: ['Wedding planner', 'Vendors'], rows: ['Wildflower $2,800 · Best value', 'Petal Co $3,150 · 1 item left out'], tap: 'Ask for a better price', then: 'Aim for $2,750: your plan and message' },
    { at: ['Wedding planner', 'Vendors'], rows: ['Budget: Florist $3,000 · booked $2,750', 'Deposit $700 · today', 'Instalments 1–3 · monthly'], tap: 'Deposit + 3 monthly', then: '4 payments, in the budget and your calendar ✓' },
    { at: ['Wedding planner', 'Vendors'], rows: ['Pay Petal Co $700 · due Fri', 'Send delivery times · by 4 Nov', 'Final check-in with Petal Co'], tap: 'Mark paid', then: 'Managed to the day ✓' },
  ],
  checklist: [
    { at: ['Wedding planner', 'Checklist'], rows: ['Book the venue · 12 months', 'Notice of Intended Marriage ⚠ by 14 Feb', 'Send invitations · 3 months'], then: 'Counted back from your date' },
    { at: ['Wedding planner', 'Checklist'], fields: [['Who?', 'Mum']], rows: ['Order the cake'], tap: 'Copy their link', then: 'Mum ticks it off on her phone' },
    { at: ['Wedding planner', 'Checklist'], rows: ['Collect the rings · 10:30am'], fields: [['Who’s doing it', 'Jess (best man)']], tap: 'Send them their link', then: 'On Jess’s list and calendar ✓' },
    { at: ['Their page'], rows: ['Collect the rings · 10:30am', 'Order the cake · 2 weeks before'], tap: 'Add my jobs to my calendar', then: 'In their calendar, with reminders ✓' },
  ],
  ceremony: [
    { at: ['Settings', 'Who can sign in'], fields: [['Their email', 'celebrant@example.com'], ['Who they are', 'Celebrant']], tap: 'Invite', then: 'They open straight to your ceremony ✓' },
    { at: ['Wedding planner', 'Ceremony'], rows: ['Getting to know you · 11 questions', 'Alex · 11 of 11 · ready', 'Sam · 6 of 11'], tap: 'Ready for the celebrant', then: 'Both ready ✓' },
    { at: ['Wedding planner', 'Ceremony'], rows: ['Earliest: 14 Sep 2026', 'Last day: 14 Feb 2028', 'Birth certificate ✓  Photo ID ✓'], fields: [['The day it reached our celebrant', '3 Jun 2027']], then: 'Notice lodged ✓' },
    { at: ['Wedding planner', 'Ceremony'], fields: [['Witness 1', 'Jordan Lee'], ['Witness 2', 'Priya Shah']], tap: 'Certificates signed', then: 'Registered within 14 days ✓' },
    { at: ['Wedding planner', 'Ceremony'], rows: ['Entrance · to “Somewhere Only We Know”', 'Readings · Mum', 'Vows · private'], tap: 'Start with the usual order', then: 'Your ceremony, in order ✓' },
  ],
  party: [
    { at: ['Wedding party', 'Overview'], fields: [['Role', 'Groomsman'], ['Name', 'Riley Chen'], ['Mobile', '0423 456 789']], tap: '+ Add Riley Chen as a groomsman', then: 'In the party and on your guest list ✓' },
    { at: ['Wedding party', 'Links & sign-ins'], rows: ['☑ Run sheet', '☑ Their to-dos', '☑ Packing', '☐ The guest list'], tap: 'Text their sign-in', then: 'Riley has their own sign-in ✓' },
    { at: ['Wedding party', 'Run sheet'], rows: ['8:00am · Breakfast together · Everyone', '1:30pm · Photos · Groom’s side', '3:00pm · Ceremony · Everyone'], tap: 'See it as: Riley', then: 'Exactly what Riley sees' },
  ],
  'text-credits': [
    { at: ['Settings', 'Texting'], rows: ['Texts aren’t included in your plan', 'Own phone or email: free'], then: 'Texts are bought separately' },
    { at: ['Settings', 'Texting'], fields: [['How many guests will you text?', '120']], then: '720 credits · $36.72 all-in' },
    { at: ['Settings', 'Texting'], tap: 'Buy 720 credits · $36.72', then: 'Paid by card: credits added' },
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
  rehearsal: [
    { at: ['Overview'], rows: ['Will it all work on the day?', 'Rehearse your wedding day'], tap: 'Start the rehearsal', then: 'A dry run: nothing is sent' },
    { at: ['Rehearsal', 'Checklist'], rows: ['● Invitations and texts · Ready', '● Seating · Fix: 1', '12 guests have no table'], tap: 'Fix it', then: 'Straight to Seating' },
    { at: ['Rehearsal', 'Timeline'], rows: ['Invitations go out', 'Reminders', 'The night before'], tap: 'The night before', then: 'Fri 13 Mar, 5:00pm' },
    { at: ['Rehearsal', 'Said yes'], rows: ['Hi Jordan, see you tomorrow! Your table, menu and parking…', 'Their table: Table 4'], then: 'Exactly what Jordan gets and sees' },
    { at: ['Rehearsal'], rows: ['On now: 2:30pm Photos', 'Coordinator has the run sheet'], tap: 'Run it again', then: 'Everything checks out ✓' },
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
  seal: [
    { at: ['Setup', 'Invitation'], rows: ['Extras', 'Envelope and seal · Sandstone seal'], tap: 'Change', then: 'Every seal and envelope option' },
    { at: ['Setup', 'Invitation'], rows: ['Wax colour: Rose gold ✓', 'Seal design: Initials in a wreath ✓'], then: 'The seal turns rose gold, with a wreath ✓' },
    { at: ['Setup', 'Invitation'], rows: ['Letters: Serif capitals ✓'], fields: [['Words on the seal', 'A & S']], then: 'Saved: your own words on the seal ✓' },
    { at: ['Setup', 'Invitation'], rows: ['Envelope colour: Navy ✓', 'Liner: Gold foil'], tap: 'Preview', then: 'Your seal and envelope, just as guests see them' },
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
