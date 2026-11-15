import type { StaffPerm } from './company';
import type { HelpArticle, HelpScene } from './help';
import type { HelpSay } from './helpSay';

/**
 * The company portal's own Help: how to run the business side, step by step, with the same animated,
 * narrated walkthroughs as the couples' Help (Walkthrough.tsx). Kept apart from HELP so couples, and their
 * planning assistant, never see the business guides. `go.tab` is a company portal tab.
 */
export const COMPANY_HELP: HelpArticle[] = [
  {
    id: 'co-bestuse',
    title: 'Running the business in ten minutes a day',
    group: 'Start here',
    steps: [
      'Open Overview each morning. “What needs you” at the top shows only what needs a person: plan requests waiting and new feedback. When it says “Nothing needs you right now”, you’re done.',
      'Under it, Goals shows this week’s paying weddings against the number needed, and each person’s and bot’s own target.',
      'Charts and the assistant are underneath. In “Ask the assistant”, Brief me on this week gives a one-page summary from the real numbers. The menu shows every section under its heading: Business, Marketing, Planning, and Team & tools.',
      'Once a week: read Feedback, check Money & tax → Are we making money?, and approve what the bots have prepared.',
      'Let the app and the bots do the rest: card payments switch plans on by themselves, texts and reminders go on their own, and backups run twice a day.',
    ],
    also: 'daily routine start how to use tips overview brief morning what to do first',
    go: { tab: 'overview' },
  },
  {
    id: 'co-inbox',
    title: 'Approving what the bots prepare',
    group: 'Start here',
    steps: [
      'The bots post their drafts to the inbox at the top of Overview → What needs you: a reply to a couple, vendor invitations, a payment link, a refund.',
      'Each card says what it is, who it’s from, and exactly what Approve will do.',
      'Change any words in a draft, then tap Approve. It runs as you, so it shows in Activity under your name. Tap Skip if it shouldn’t happen.',
      'Reports, like the weekly brief, only need Got it. What you decided this week folds away underneath.',
    ],
    also: 'inbox approve approval drafts bots grok yes skip waiting review sign off decide',
    go: { tab: 'overview' },
  },
  {
    id: 'co-connections',
    title: 'Connecting card payments, email and texts',
    group: 'Start here',
    steps: [
      'Open Settings → Connections (owners only). Each service has its own card with the steps and an Open button.',
      'Card payments: in Stripe copy the Secret key, then add a webhook with the address shown and the event checkout.session.completed, and copy its Signing secret. Paste both.',
      'Email: verify your domain in Resend, create an API key, and paste it with the From address.',
      'Texts (optional): paste your Mobile Message API username and password. Google Drive and Dropbox work the same way.',
      'Keys are kept encrypted and never shown again. They work straight away: no deploy needed.',
    ],
    also: 'stripe keys api key resend email mobile message sms setup connect google dropbox webhook secret paste',
    go: { tab: 'settings' },
  },
  {
    id: 'co-requests',
    title: 'When a couple asks for a plan',
    group: 'Couples and support',
    steps: [
      'With card payments connected, there’s nothing to do: the couple pays at checkout and the plan switches on by itself.',
      'Without card payments, the request shows on Overview → To do and at the top of Couples.',
      'Step 1, Email it: sends the couple the payment link for that plan (set the links in Settings → Payment links).',
      'Step 2, once the money is in your bank: check the amount and tap Mark paid. The plan switches on and the money is counted.',
      'Not going ahead? Tap “Not now: clear the request”.',
    ],
    also: 'upgrade request payment link mark paid essentials deluxe extra event plan switch on bank transfer',
    go: { tab: 'weddings' },
  },
  {
    id: 'co-couples',
    title: 'Finding a couple and changing their plan',
    group: 'Couples and support',
    steps: [
      'Open Couples and search by names, the wedding’s address or an email.',
      'Each wedding shows its plan, guests, replies and what they’ve paid.',
      'To change a plan without a payment (a friend, a fix), pick the plan and extra events, then Save.',
      'Refund: type the amount and why, choose whether to switch them back to Free, and confirm. Card refunds go back through Stripe.',
    ],
    also: 'search wedding couple find change plan refund money back cancel downgrade free',
    go: { tab: 'weddings' },
  },
  {
    id: 'co-feedback',
    title: 'Feedback and “Coming from your feedback”',
    group: 'Couples and support',
    steps: [
      'Couples send ideas and problems from Help → Tell us. They land in Feedback as New.',
      'Read each one, assign it to someone on the team, and move it along: Planned, In progress, Done, or Not now.',
      'Add a short note when you plan it, like “Seating: bigger rooms”. Every couple sees it under “Coming from your feedback”.',
      'To answer someone, type a reply or tap “Draft it for me”, check it, then Send reply. It goes by email from the support address.',
    ],
    also: 'ideas problems bugs reply support email tell us roadmap planned done not now assign',
    go: { tab: 'feedback' },
  },
  {
    id: 'co-promos',
    title: 'Promo codes and the front-page banner',
    group: 'Growth',
    steps: [
      'Open Promote → Promo codes and tap “+ Add a code”: the code, how much off, which plans, and how many uses.',
      '100% off switches the plan on without a card: good for friends, influencers and giveaways.',
      'Tick On, then Save codes. Each code shows how many times it’s been used.',
      'Front-page banner: one line across the top of the front page, like a launch offer. Type it, add a link if you like, and Save banner.',
    ],
    also: 'discount coupon code offer sale giveaway influencer banner announcement front page',
    go: { tab: 'promote' },
  },
  {
    id: 'co-campaigns',
    title: 'Campaign links and ready-to-post captions',
    group: 'Growth',
    steps: [
      'Add ?ref= to any link you share, like ?ref=instagram. Sign-ups through it are counted under Campaign links.',
      'Ready to post has captions for Instagram, Facebook, TikTok and friends, with your link and the current code filled in. Copy, paste, post.',
      'Need something new? Write with the assistant → Write 3 posts, or Draft an outreach email to a celebrant or venue. Check every draft before it goes out.',
      'Marketing list: only people who ticked “send me news”. Download it for your mailing tool, and email nobody else.',
    ],
    also: 'social media instagram facebook tiktok posts captions ref link referral tracking where sign ups came from marketing list mailing outreach',
    go: { tab: 'promote' },
  },
  {
    id: 'co-vendors',
    title: 'The vendor directory and partner codes',
    group: 'Growth',
    steps: [
      'Vendors who list themselves show here. Hide anything that shouldn’t be in the directory.',
      'Every vendor gets a partner code: their couples get 10% off, and you see how many used it.',
      'Invite vendors: add a business with its email, category and region, or paste a list, one per line.',
      'Pick who to invite (up to 50 a day) and send. Only use businesses’ published work addresses.',
    ],
    also: 'directory celebrants venues photographers planners partners partner code invite vendors listings hide',
    go: { tab: 'vendors' },
  },
  {
    id: 'co-money',
    title: 'Money and tax',
    group: 'Money',
    steps: [
      'Money & tax shows sales, card fees, GST and expenses by quarter, the same quarters as a BAS.',
      'Add every expense as it happens: the date, what it was, the kind and the amount. Keep the receipts.',
      'Each quarter, move the “put aside” amount to a separate tax savings account.',
      'Tax settings: say whether you’re registered for GST and from when. It’s a guide for you and your accountant, not tax advice.',
    ],
    also: 'tax gst bas expenses receipts quarter accountant costs spending financial year put aside',
    go: { tab: 'money' },
  },
  {
    id: 'co-profit',
    title: 'Are we making money? Goals and targets',
    group: 'Money',
    steps: [
      'Are we making money? uses this month’s real payments, card fees, running costs and expenses.',
      'Running costs each month: the bots, hosting, email and yearly costs divided by twelve. Every profit figure uses them.',
      'Sales targets and the big goal: set the profit you want and by when. It works out how many paying weddings that needs each week.',
      'What if…: change the prices or the plan mix and see the effect before you change anything for real.',
    ],
    also: 'profit goal target break even running costs what if forecast prices weddings needed revenue',
    go: { tab: 'money' },
  },
  {
    id: 'co-team',
    title: 'Inviting your team and setting roles',
    group: 'Team and bots',
    steps: [
      'Open Team → Invite someone: their email and a role. They get a link (good for a week, once) to set up their sign-in.',
      'Each role sees only its part of the portal. “What each role can do” lists them.',
      'Make your own roles under Your own roles: tick the parts it reaches, then untick anything within a part they shouldn’t do, like refunds or the marketing list. Give it to someone from the team list.',
      'Weekly targets: give each person and bot a weekly number. The team’s total shows against what the goal needs.',
    ],
    also: 'staff team member invite role permissions bookkeeper developer support marketing manager weekly targets remove',
    go: { tab: 'team' },
  },
  {
    id: 'co-bots',
    title: 'Setting up a Grok bot',
    group: 'Team and bots',
    steps: [
      'Open Team → Bots. Give the bot a name and a role, then tap “Create a key”.',
      'Copy the key straight away: it isn’t shown again. Give it to the bot with its instructions from the bot playbook.',
      'The bot sees and does only what its role allows. Everything it does shows in Activity under its name.',
      'Something wrong? Tap Switch off and its key stops working at once. Bots are never owners.',
    ],
    also: 'grok bot ai automation key api assistant robot playbook switch off revoke automate',
    go: { tab: 'team' },
  },
  {
    id: 'co-traffic',
    title: 'Traffic and errors',
    group: 'Team and bots',
    steps: [
      'Traffic & errors shows visitors a day and which pages they opened, counted without cookies.',
      'Sign-ins and new couples by day show whether visitors are turning into couples.',
      'Errors come from the server and from visitors’ browsers, latest first, with the same one counted together.',
      'An error that keeps growing? Add it to Feedback as a problem so the developer picks it up.',
    ],
    also: 'visitors analytics page views errors bugs crashes broken site down',
    go: { tab: 'traffic' },
  },
  {
    id: 'co-activity',
    title: 'Who did what: Activity',
    group: 'Team and bots',
    steps: [
      'Activity lists every change in the portal, with who made it: people and bots.',
      'Card payments show as Card payment.',
      'Use it to check what a bot has done, or to see who changed a plan or a code.',
    ],
    also: 'log history audit who changed what record bot actions',
    go: { tab: 'activity' },
  },
  {
    id: 'co-settings',
    title: 'Payment links, social accounts and “Made with”',
    group: 'Start here',
    steps: [
      'Payment links: one per plan, from Stripe Payment Links or your bank. Couples → Email it sends the matching one.',
      'Social accounts: shown at the foot of the front page. Leave any blank to hide it.',
      'On guest pages: Basic-plan invitations can carry a small “Made with The Yes List” link that counts the wedding as the referrer. Paid plans never show it.',
      'Tap Save settings.',
    ],
    also: 'settings payment links social instagram facebook support email made with footer referral',
    go: { tab: 'settings' },
  },
  {
    id: 'co-todo',
    title: 'The launch to-do list',
    group: 'Start here',
    steps: [
      'Overview → To-do list holds what’s left to set up and launch. Everyone on the team sees the same list.',
      'Add a to-do, tick things off as you go, and tap one to jump to where it’s done.',
    ],
    also: 'launch checklist tasks setup list to do go live',
    go: { tab: 'overview' },
  },
];

/** Where the company portal's menu calls each place, for the walkthrough's phone. */
export const COMPANY_HELP_PLACES: Record<string, string> = {
  overview: 'Overview',
  weddings: 'Couples',
  feedback: 'Feedback',
  promote: 'Promote',
  vendors: 'Vendors',
  money: 'Money & tax',
  team: 'Team',
  traffic: 'Traffic',
  activity: 'Activity',
  settings: 'Settings',
};

/** The company tour: the guides to play one after another for someone new to the portal. */
export const COMPANY_HELP_TOUR = ['co-bestuse', 'co-inbox', 'co-connections', 'co-requests', 'co-feedback', 'co-promos', 'co-bots'];

export const COMPANY_HELP_SCENES: Record<string, HelpScene[]> = {
  'co-bestuse': [
    { at: ['Overview', 'To do'], rows: ['2 plan requests', '3 new feedback'], tap: 'Open', then: 'Only what needs you' },
    { at: ['Overview', 'Goals'], rows: ['This week: 4 of 6 paying weddings', 'Grok · 2 of 3'], then: 'On track ✓' },
    { at: ['Overview', 'Assistant'], tap: 'Brief me on this week', then: 'A one-page brief, from the real numbers' },
    { at: ['Feedback'], rows: ['Idea: bigger seating rooms', 'Problem: import a .csv'], tap: 'Planned', then: 'Couples see it’s coming ✓' },
    { at: ['Overview'], rows: ['Card payment · Essentials · $88', 'Backup ran 2:00pm ✓'], then: 'The rest runs by itself' },
  ],
  'co-inbox': [
    { at: ['Overview', 'What needs you'], rows: ['Reply to Alex & Sam · from Grok', 'Invite 12 vendors · from Grok'], then: 'Drafts waiting for your yes' },
    { at: ['Overview', 'What needs you'], rows: ['Approve: Emails this reply to the couple'], then: 'You see exactly what happens' },
    { at: ['Overview', 'What needs you'], fields: [['The draft', 'Hi Alex, great idea! Seating rooms…']], tap: 'Approve', then: 'Sent, under your name ✓' },
    { at: ['Overview', 'What needs you'], rows: ['Report · Weekly brief · from Grok'], tap: 'Got it', then: 'Decided this week (3)' },
  ],
  'co-connections': [
    { at: ['Settings', 'Connections'], rows: ['Card payments · not set', 'Email · not set', 'Texts · not set'], tap: 'Open Stripe', then: 'Stripe opens in a new tab' },
    { at: ['Settings', 'Connections'], fields: [['Secret key', 'sk_live_••••••'], ['Webhook signing secret', 'whsec_••••••']], tap: 'Save', then: 'Card payments on ✓' },
    { at: ['Settings', 'Connections'], fields: [['API key', 're_••••••'], ['From address', 'The Yes List <hello@…>']], tap: 'Save', then: 'Email on ✓' },
    { at: ['Settings', 'Connections'], fields: [['API username', 'yeslist'], ['API password', '••••••']], tap: 'Save', then: 'Texts on ✓' },
    { at: ['Settings', 'Connections'], rows: ['Card payments · on ✓', 'Email · on ✓', 'Texts · on ✓'], then: 'Working straight away' },
  ],
  'co-requests': [
    { at: ['Couples'], rows: ['Alex & Sam · Essentials · paid by card ✓'], then: 'Switched on by itself' },
    { at: ['Overview', 'To do'], rows: ['1 plan request', 'Send the payment link, then mark it paid'], tap: 'Open', then: 'Straight to Couples' },
    { at: ['Couples'], rows: ['Jordan & Casey · asked for Deluxe · $98'], tap: 'Email it', then: 'Payment link emailed ✓' },
    { at: ['Couples'], fields: [['Amount paid', '$98']], tap: 'Mark paid', then: 'Deluxe switched on, $98 counted ✓' },
    { at: ['Couples'], rows: ['Priya & Ben · asked for an extra event'], tap: 'Not now: clear the request', then: 'Request cleared' },
  ],
  'co-couples': [
    { at: ['Couples'], fields: [['Search', 'casey']], then: 'Jordan & Casey · Essentials' },
    { at: ['Couples'], rows: ['112 guests · 84 replies', 'Paid $88'], then: 'Everything on one row' },
    { at: ['Couples'], fields: [['Plan', 'Deluxe']], tap: 'Save', then: 'Plan changed ✓' },
    { at: ['Couples', 'Refund'], fields: [['Refund ($)', '88'], ['Why', 'Wedding cancelled']], tap: 'Refund', then: 'Refunded through Stripe ✓' },
  ],
  'co-feedback': [
    { at: ['Feedback'], rows: ['New · Idea: seating by family', 'New · Problem: photo upload slow'], then: 'Straight from Help → Tell us' },
    { at: ['Feedback'], fields: [['For', 'Developer']], tap: 'Planned', then: 'Assigned and planned ✓' },
    { at: ['Feedback'], fields: [['What we’ll do', 'Seating: group by family']], tap: 'Save', then: 'Couples see it coming ✓' },
    { at: ['Feedback'], tap: 'Draft it for me', then: 'Reply sent from the support address ✓' },
  ],
  'co-promos': [
    { at: ['Promote', 'Promo codes'], fields: [['Code', 'YES20'], ['Off', '20%']], tap: '+ Add a code', then: 'YES20 added' },
    { at: ['Promote', 'Promo codes'], fields: [['Code', 'FRIENDS'], ['Off', '100%']], then: 'No card needed ✓' },
    { at: ['Promote', 'Promo codes'], rows: ['YES20 · On · used 12', 'FRIENDS · On · used 3'], tap: 'Save codes', then: 'Saved ✓' },
    { at: ['Promote', 'Banner'], fields: [['Banner text', 'Launch week: 20% off with YES20']], tap: 'Save banner', then: 'Live on the front page ✓' },
  ],
  'co-campaigns': [
    { at: ['Promote', 'Campaign links'], rows: ['instagram · 14 sign-ups', 'expo-2026 · 6 sign-ups'], then: 'Counted for you' },
    { at: ['Promote', 'Ready to post'], rows: ['Instagram caption', 'Facebook post', 'TikTok idea'], tap: 'Copy', then: 'Copied: paste and post' },
    { at: ['Promote', 'Assistant'], fields: [['What about?', 'seating that follows your rules']], tap: 'Write 3 posts', then: 'Three drafts to check' },
    { at: ['Promote', 'Marketing list'], rows: ['48 said yes to news'], tap: 'Download', then: 'Ready for your mailing tool' },
  ],
  'co-vendors': [
    { at: ['Vendors'], rows: ['Harbour Celebrants · shown', 'Spammy Listing · hidden'], tap: 'Hide', then: 'Hidden from the directory' },
    { at: ['Vendors'], rows: ['Harbour Celebrants · code HARBOUR10 · used 4'], then: '10% off for their couples' },
    { at: ['Vendors', 'Invite vendors'], fields: [['Business', 'Rose Hill Venue'], ['Region', 'Hunter Valley']], tap: '+ Add', then: 'Added to the list' },
    { at: ['Vendors', 'Invite vendors'], rows: ['☑ Rose Hill Venue', '☑ Coastal Florals'], tap: 'Invite', then: '2 invited ✓' },
  ],
  'co-money': [
    { at: ['Money & tax', 'By quarter'], rows: ['Oct–Dec · sales $2,640', 'Card fees $52 · put aside $420'], then: 'The same quarters as a BAS' },
    { at: ['Money & tax', 'Expenses'], fields: [['What it was', 'Domain'], ['Amount', '$24']], tap: 'Add', then: 'Expense added ✓' },
    { at: ['Money & tax'], rows: ['Move to your tax savings account: $420'], then: 'Set aside each quarter' },
    { at: ['Money & tax', 'Tax settings'], fields: [['Registered for GST', 'No']], tap: 'Save', then: 'Saved ✓' },
  ],
  'co-profit': [
    { at: ['Money & tax', 'Profit'], rows: ['This month: $1,180 profit', 'Break-even passed ✓'], then: 'From real payments' },
    { at: ['Money & tax', 'Running costs'], fields: [['Grok bot', '$30 a month']], tap: 'Save', then: 'Every profit figure updated' },
    { at: ['Money & tax', 'Sales targets'], fields: [['Profit target', '$4,000 a month']], then: '11 paying weddings a week needed' },
    { at: ['Money & tax', 'What if…'], fields: [['Deluxe price', '$108']], then: 'Profit goes up $260 a month' },
  ],
  'co-team': [
    { at: ['Team', 'Invite someone'], fields: [['Email', 'sam@example.com'], ['Role', 'Support']], tap: 'Invite', then: 'Invite sent ✓' },
    { at: ['Team', 'What each role can do'], rows: ['Support · Couples, Feedback', 'Marketing · Promote, Vendors'], then: 'Each sees only their part' },
    { at: ['Team', 'Your own roles'], fields: [['Role', 'Bookkeeper']], tap: 'Save', then: 'Bookkeeper: Money and Activity ✓' },
    { at: ['Team', 'Weekly targets'], fields: [['Sam', '3 a week'], ['Grok', '2 a week']], tap: 'Save', then: 'Targets set ✓' },
  ],
  'co-bots': [
    { at: ['Team', 'Bots'], fields: [['Name', 'Grok'], ['Role', 'Support']], tap: 'Create a key', then: 'Key made' },
    { at: ['Team', 'Bots'], rows: ['Copy this key now: it won’t be shown again.'], tap: 'Copy key', then: 'Key copied ✓' },
    { at: ['Activity'], rows: ['Grok · emailed a payment link', 'Grok · moved feedback to Planned'], then: 'Every action under its name' },
    { at: ['Team', 'Bots'], rows: ['Grok · Support · last used today'], tap: 'Switch off', then: 'Key stopped at once ✓' },
  ],
  'co-traffic': [
    { at: ['Traffic'], rows: ['Visitors a day · 140', 'Front page · Pricing · Sample'], then: 'Counted without cookies' },
    { at: ['Traffic'], rows: ['Sign-ins 38 · new couples 6'], then: 'Visitors becoming couples' },
    { at: ['Traffic', 'Errors'], rows: ['Upload failed · 3 times', 'Seating save · once'], then: 'Latest first' },
    { at: ['Feedback'], rows: ['Problem: upload failed (from Errors)'], tap: 'Planned', then: 'The developer picks it up' },
  ],
  'co-activity': [
    { at: ['Activity'], rows: ['Sam · changed a plan', 'Grok · sent a payment link', 'You · saved promo codes'], then: 'Every change, with who' },
    { at: ['Activity'], rows: ['Card payment · Essentials · $88'], then: 'Payments are in here too' },
    { at: ['Activity'], rows: ['Grok · 6 actions today'], then: 'Check on the bots any time' },
  ],
  'co-settings': [
    { at: ['Settings', 'Payment links'], fields: [['Essentials', 'https://buy.stripe.com/…']], then: 'Sent for plan requests' },
    { at: ['Settings', 'Social accounts'], fields: [['Instagram', 'theyeslist']], then: 'On the front page’s footer' },
    { at: ['Settings', 'On guest pages'], rows: ['☑ Show “Made with The Yes List” on Basic'], then: 'Paid plans never show it' },
    { at: ['Settings'], tap: 'Save settings', then: 'Saved ✓' },
  ],
  'co-todo': [
    { at: ['Overview', 'To-do list'], fields: [['Add a to-do', 'Verify the domain in Resend']], tap: 'Add', then: 'On everyone’s list' },
    { at: ['Overview', 'To-do list'], rows: ['☑ Stripe keys in', '☐ Verify the domain'], then: 'Tick them off as you go ✓' },
  ],
};

/** What the company walkthroughs say out loud: one line per step, written to be heard (see helpSay.ts). */
export const COMPANY_HELP_SAY: Record<string, HelpSay> = {
  'co-bestuse': {
    intro: 'Here’s how to run the business in about ten minutes a day.',
    steps: [
      'Start each morning in Overview. What needs you shows only what needs a person. When there’s nothing there, you’re done.',
      'Under it, Goals shows this week’s paying weddings against what you need, and everyone’s own target.',
      'Charts and the assistant are underneath. Ask the assistant for a brief on the week. The menu shows every section: Business, Marketing, Planning, and Team and tools.',
      'Once a week, read the feedback, check whether you’re making money, and approve what the bots have prepared.',
      'The rest runs by itself. Card payments switch plans on, texts go out, and backups run twice a day.',
    ],
    outro: 'That’s the routine. Short and steady.',
  },
  'co-inbox': {
    intro: 'Here’s how to approve what the bots prepare.',
    steps: [
      'The bots post their drafts at the top of Overview, under what needs you. Replies, invitations, payment links, refunds.',
      'Each card says what it is, who it’s from, and exactly what approve will do.',
      'Change any words you like, then tap approve. It runs as you. Or tap skip if it shouldn’t happen.',
      'Reports, like the weekly brief, just need got it.',
    ],
    outro: 'That’s it. A few taps a day.',
  },
  'co-connections': {
    intro: 'Here’s how to connect card payments, email and texts.',
    steps: [
      'Open Settings, then Connections. Each service has its own card, with the steps and a button to open it.',
      'For card payments, copy Stripe’s secret key. Then add a webhook with the address shown, copy its signing secret, and paste both.',
      'For email, verify your domain in Resend, make an API key, and paste it with your from address.',
      'Texts are optional. Paste your Mobile Message username and password. Google Drive and Dropbox work the same way.',
      'Keys are kept encrypted, never shown again, and they work straight away.',
    ],
    outro: 'That’s it. You’re connected.',
  },
  'co-requests': {
    intro: 'Here’s what to do when a couple asks for a plan.',
    steps: [
      'With card payments connected, nothing. The couple pays, and the plan switches on by itself.',
      'Without card payments, the request shows in To do, and at the top of Couples.',
      'Step one. Tap Email it, and the couple gets the payment link for that plan.',
      'Step two. Once the money’s in your bank, check the amount, and tap Mark paid. The plan switches on.',
      'Not going ahead? Just clear the request.',
    ],
    outro: 'Done. Two taps a couple.',
  },
  'co-couples': {
    intro: 'Here’s how to find a couple and change their plan.',
    steps: [
      'Open Couples, and search by names, the wedding’s address, or an email.',
      'Each wedding shows its plan, guests, replies, and what they’ve paid.',
      'To change a plan without a payment, pick the plan, and save.',
      'For a refund, type the amount and the reason, choose whether to switch them back, and confirm. Card refunds go back through Stripe.',
    ],
    outro: 'That’s it.',
  },
  'co-feedback': {
    intro: 'Here’s how feedback works.',
    steps: [
      'Couples send ideas and problems from Help. They land in Feedback, marked new.',
      'Read each one, give it to someone on the team, and move it along. Planned, in progress, done, or not now.',
      'Add a short note when you plan it. Every couple sees it, under coming from your feedback.',
      'To answer someone, write a reply, or tap draft it for me. Check it, then send. It goes from the support address.',
    ],
    outro: 'That’s it. Couples love seeing their ideas arrive.',
  },
  'co-promos': {
    intro: 'Here’s how to make promo codes, and the front-page banner.',
    steps: [
      'Open Promote, and tap add a code. Choose the code, how much off, which plans, and how many uses.',
      'A hundred percent off switches the plan on with no card. Great for friends and giveaways.',
      'Tick on, then save the codes. Each one shows how many times it’s been used.',
      'The banner is one line across the top of the front page. Type it, add a link if you like, and save.',
    ],
    outro: 'That’s it. Your offer is live.',
  },
  'co-campaigns': {
    intro: 'Here’s how to track where sign-ups come from, and post faster.',
    steps: [
      'Add ref equals, then a name, to any link you share. Sign-ups through it are counted for you.',
      'Ready to post has captions for each platform, with your link and code filled in. Copy, paste, post.',
      'Need something new? The assistant writes three posts, or a first email to a celebrant. Check every draft.',
      'The marketing list is only people who said yes to news. Email nobody else.',
    ],
    outro: 'That’s it. Post, and watch the numbers.',
  },
  'co-vendors': {
    intro: 'Here’s how the vendor directory works.',
    steps: [
      'Vendors who list themselves show here. Hide anything that shouldn’t be there.',
      'Every vendor gets a partner code. Their couples get ten percent off, and you see how many used it.',
      'To invite vendors, add a business with its email and region, or paste a whole list.',
      'Pick who to invite, up to fifty a day, and send. Only use their published work addresses.',
    ],
    outro: 'That’s it. More partners, more couples.',
  },
  'co-money': {
    intro: 'Here’s how money and tax work.',
    steps: [
      'Money and tax shows sales, card fees, GST and expenses, by quarter. The same quarters as a BAS.',
      'Add every expense as it happens. The date, what it was, and the amount. Keep the receipts.',
      'Each quarter, move the put aside amount into a separate tax savings account.',
      'In tax settings, say whether you’re registered for GST. It’s a guide for you and your accountant, not tax advice.',
    ],
    outro: 'That’s it. No surprises at tax time.',
  },
  'co-profit': {
    intro: 'Here’s how to see whether you’re making money.',
    steps: [
      'Are we making money uses this month’s real payments, card fees, running costs and expenses.',
      'Running costs are what you pay every month, like the bots and hosting. Every profit figure uses them.',
      'Set your profit target and the big goal. It works out how many paying weddings you need each week.',
      'What if lets you try new prices or a different plan mix, before you change anything for real.',
    ],
    outro: 'That’s it. Know your numbers.',
  },
  'co-team': {
    intro: 'Here’s how to bring people onto the team.',
    steps: [
      'Open Team, then invite someone, with their email and a role. They get a link to set up their sign-in.',
      'Each role sees only its own part of the portal.',
      'Make your own roles. Tick the parts they reach, then untick anything they shouldn’t do, like refunds.',
      'Give each person and bot a weekly target, and see the total against what the goal needs.',
    ],
    outro: 'That’s it. Welcome to the team.',
  },
  'co-bots': {
    intro: 'Here’s how to set up a Grok bot.',
    steps: [
      'Open Team, then Bots. Give it a name and a role, and tap create a key.',
      'Copy the key straight away. It won’t be shown again. Give it to the bot, with its instructions.',
      'The bot can only do what its role allows, and everything it does shows in Activity.',
      'Something wrong? Tap switch off, and its key stops working at once.',
    ],
    outro: 'That’s it. Your first team member that never sleeps.',
  },
  'co-traffic': {
    intro: 'Here’s how to read traffic and errors.',
    steps: [
      'Traffic shows visitors a day, and which pages they opened. No cookies needed.',
      'Sign-ins and new couples by day show whether visitors are turning into couples.',
      'Errors come from the server and from visitors’ browsers, latest first.',
      'One that keeps growing? Add it to feedback as a problem, so the developer picks it up.',
    ],
    outro: 'That’s it.',
  },
  'co-activity': {
    intro: 'Here’s how to see who did what.',
    steps: [
      'Activity lists every change in the portal, and who made it. People and bots.',
      'Card payments show up here too.',
      'Use it to check what a bot has done, or who changed a plan.',
    ],
    outro: 'That’s it. Nothing happens unseen.',
  },
  'co-settings': {
    intro: 'Here’s what’s in Settings.',
    steps: [
      'Payment links. One for each plan. They’re emailed when a couple asks for that plan.',
      'Social accounts show at the foot of the front page. Leave any blank to hide it.',
      'Basic invitations can show a small made with link, which counts the wedding as the referrer. Paid plans never show it.',
      'Then tap save settings.',
    ],
    outro: 'That’s it.',
  },
  'co-todo': {
    intro: 'Here’s the launch to-do list.',
    steps: [
      'The to-do list in Overview holds what’s left to set up and launch. The whole team sees the same list.',
      'Add a to-do, tick things off as you go, and tap one to jump straight to it.',
    ],
    outro: 'That’s it. Tick, tick, launch.',
  },
};

/** Which permission opens each company tab (the same as the portal's menu): a guide shows only to those who can use it. */
export const COMPANY_TAB_PERM: Record<string, StaffPerm> = {
  overview: 'overview',
  weddings: 'couples',
  feedback: 'feedback',
  promote: 'promote',
  vendors: 'vendors',
  money: 'money',
  team: 'team',
  traffic: 'activity',
  activity: 'activity',
  settings: 'settings',
};

/** Whether someone with these permissions may read this company guide. */
export const companyHelpAllowed = (id: string, perms: readonly string[]): boolean => {
  const a = COMPANY_HELP.find((x) => x.id === id);
  const perm = a && COMPANY_TAB_PERM[a.go.tab];
  return !!perm && perms.includes(perm);
};

/**
 * The company Help that one person may see: only guides for the tabs their role opens, with their scenes and
 * spoken lines. Served by the API to signed-in staff only (GET /api/a/company/help), never built into the
 * public website's code.
 */
export function companyHelpFor(perms: readonly string[]) {
  const articles = COMPANY_HELP.filter((a) => companyHelpAllowed(a.id, perms));
  const ids = new Set(articles.map((a) => a.id));
  const pick = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => ids.has(k)));
  return { articles, scenes: pick(COMPANY_HELP_SCENES), say: pick(COMPANY_HELP_SAY), places: COMPANY_HELP_PLACES, tour: COMPANY_HELP_TOUR.filter((id) => ids.has(id)) };
}
export type CompanyHelpPack = ReturnType<typeof companyHelpFor>;

/** One spoken line of a company guide (step -1 is the intro; the last step carries the outro), or null. */
export function companyHelpSayLine(id: string, step: number): string | null {
  const s = Object.prototype.hasOwnProperty.call(COMPANY_HELP_SAY, id) ? COMPANY_HELP_SAY[id] : undefined;
  if (!s || !Number.isInteger(step)) return null;
  if (step === -1) return s.intro;
  const line = s.steps[step];
  if (line === undefined) return null;
  return step === s.steps.length - 1 ? `${line} ${s.outro}` : line;
}
