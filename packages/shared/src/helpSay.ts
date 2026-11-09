/**
 * What the walkthroughs say out loud. The on-screen steps (HELP in help.ts) are written to be read; these
 * are written to be heard: short sentences, contractions, a friendly hello and a "that's it". One line per
 * step of each guide (same order as its steps), plus an intro for the title and an outro after the last
 * step. Commas, full stops and dashes are pauses the voice respects. Keep each line under 220 characters.
 *
 * The voice is Cloudflare Workers AI text to speech (HELP_VOICE), made once per line and kept (the API's
 * help_audio table); the device's own voice reads the same words when that isn't available.
 */
export interface HelpSay {
  intro: string;
  steps: string[];
  outro: string;
}

/** The natural voice: Deepgram Aura 2 on Workers AI, Theia (an Australian woman's voice); Aura 1 if that fails. */
export const HELP_VOICE = { model: '@cf/deepgram/aura-2-en', speaker: 'theia' } as const;
export const HELP_VOICE_BACKUP = { model: '@cf/deepgram/aura-1', speaker: 'athena' } as const;

export const HELP_SAY: Record<string, HelpSay> = {
  bestuse: {
    intro: 'Here’s how to get the most out of it, from now right through to the day.',
    steps: [
      'First, add your events and set a budget. Then open the checklist. It’s already filled in, month by month. Add your own tasks, and hand each one to whoever’s doing it.',
      'When you book a vendor, add them with their quote. Drop in the contract, and the payment dates go straight into your schedule. You’ll get a nudge before each one’s due.',
      'Add your guests early, and pop them into groups, like uni friends, or Alex’s family. Then connect your Google Drive, just once. Photos, contracts and backups get filed for you.',
      'Pick the look of your invitation, preview it, then switch on texts. Replies and dietary needs come back on their own. And the Overview always shows what’s left to do.',
      'In the last month, sort the special menus, then auto-seat everyone. It follows your seating rules. Publish the plan, and fill in the night-before guide.',
      'The night before, guests get their table, meal and a map. On the day, they share photos with the QR code on each table. And it all stays safe in your Drive.',
    ],
    outro: 'That’s the lot. Take it one step at a time — you’ve got this.',
  },
  start: {
    intro: 'Here’s how to get set up. It only takes a few minutes.',
    steps: [
      'Start in Overview. Add your events, like the wedding, welcome drinks, or a recovery brunch, with their dates and venues.',
      'Next, open Setup. Pop in your names, the details, and the invitation wording.',
      'Now choose a look. Colours, envelope, wording. Then tap Preview, and you’ll see exactly what your guests will get.',
      'Finally, add your guests. Then you can send the invitations from Texts.',
    ],
    outro: 'That’s it — you’re set up and ready to go.',
  },
  guests: {
    intro: 'Here’s how to add your guests.',
    steps: [
      'Open Guests, and tap Add guest. Their details open straight away, invited to every event. Tick Child for any kids. And to delete someone, just slide them to the left.',
      'Got a spreadsheet, or your phone’s contacts? Import them instead. Addresses come too, so you can post printed invitations, and print the address labels.',
      'Then say who each guest is to you. Whose side they’re on, how they know you, like uni friend or ex-work, and their circles, the people they know. Seating uses all of it.',
      'Doing lots at once? Tap Select, tick your guests, and set their side, or add a circle, in one go. Tap Group by side to see each side together.',
    ],
    outro: 'That’s it — your guest list is in.',
  },
  invitations: {
    intro: 'Here’s how to send your invitations, and the reminders after.',
    steps: [
      'Open Texts. Once texting’s set up, the invitation goes out on autopilot, to everyone with a mobile who hasn’t had it yet.',
      'Want a gentle nudge? Add a reminder for anyone still to reply. Or add a last call, a week before your reply-by date.',
      'Before anything sends, you’ll see who it goes to, and what it costs. Tap Send me a test, and it comes to your own phone first.',
    ],
    outro: 'That’s it. The replies will start rolling in.',
  },
  replies: {
    intro: 'Here’s how replies, questions and dietary needs come back to you.',
    steps: [
      'Guests reply on their own page, or just text yes or no. Either way, it’s recorded straight away.',
      'If someone texts a dietary need, like, Sam is vegan, it’s noted on that guest. And questions your guide already answers, like parking or what to wear, get answered for you.',
      'Anything else lands in Messages, as unread. You can reply right from there.',
    ],
    outro: 'That’s it — nothing slips through the cracks.',
  },
  dietary: {
    intro: 'Here’s how to sort out dietary needs and meals.',
    steps: [
      'Open Guests, then Dietary. You’ll see every need, by guest. Serious allergies are flagged, and the kitchen’s counts are right there.',
      'Under Menus, add each special menu your caterer offers, and say what it’s safe for. Do the same for the set menu.',
      'Now tap Give them their menus. Everyone with a need gets the one menu that covers it. You can change anyone’s, any time.',
      'Anything to double-check gets flagged. When you’re happy, download the caterer’s list, with tables, needs and courses.',
    ],
    outro: 'That’s it. Your caterer will love you.',
  },
  seating: {
    intro: 'Here’s how to do your seating plan.',
    steps: [
      'Open Guests, then Seating, and tap Edit seating. The tools sit in three tabs: Seat guests, Tables, and Room. The two of you are already there to seat.',
      'In Room, set the room’s shape and size, or its exact size in metres. Add the dance floor and bar, and give each one its width and depth.',
      'In Tables, add tables and tap the plan to drop them in. Drag them around, and tap one to set its seats, type and size in metres.',
      'In Seat guests, tap names to seat people, or let Auto-seat do the rest. Tap a table to open it big, then tap a chair to choose who sits there, or add a seat.',
      'You can start with a concept plan, before the invitations even go out. As replies come in, nothing moves. Anyone who can’t come frees their seat, and auto-seat fills the gaps.',
      'There are sensible rules built in. Households sit together, circles stay together, and family sit near the head table. Add your own too, like keeping two people apart, or saying two people know each other.',
      'Want a fresh idea? Tap Suggest a plan from who knows who. It makes a new version, and shows how it compares. Your current plan doesn’t change, unless you make the new one current.',
      'Save as you go, and keep a version at each stage, like Concept plan, or Final. You can always switch back.',
      'When you’re happy, tap Publish. Guests who’ve said yes see their table in their night-before guide. Publish again as more say yes.',
    ],
    outro: 'That’s it — everyone’s got a seat.',
  },
  budget: {
    intro: 'Here’s how to keep on top of your budget and payments.',
    steps: [
      'Open the Wedding planner, then Money. Enter your total and your guest count, and it’s split into the usual categories for you.',
      'Link each line to a vendor. Once they’re booked, their quote counts as money you’ve committed.',
      'Payments shows every deposit and instalment, by due date. Tick each one off when it’s paid, and the reminders go in your phone’s calendar.',
    ],
    outro: 'That’s it. No surprise bills.',
  },
  vendors: {
    intro: 'Here’s how to find your vendors.',
    steps: [
      'Open the Wedding planner, then Vendors. Search the directory near your venue, or add your own.',
      'The quote tracker shows who you’ve asked, who’s quoted, and who needs a little chase.',
      'Tap Save to phone contacts, and your booked vendors are right there in your phone.',
    ],
    outro: 'That’s it — your dream team, all in one place.',
  },
  quotes: {
    intro: 'Here’s how to go from first quote to fully booked, in five easy steps.',
    steps: [
      'Step one. In Vendors, tap Add a vendor for everyone you’re thinking about. A name, what they do, and an email or mobile is plenty.',
      'Step two. Tap Get quotes, choose what for, and send. Each vendor prices it on their own link, and slow ones get a friendly reminder.',
      'Step three. Compare them, best value first, like for like. Tap Ask for a better price, and you’ll get a plan, and a message ready to send.',
      'Step four. Lock in your favourite. Put them on the budget, set up their payments, like a deposit and three monthly, and sign the contract.',
      'Step five. Manage them. Payments due, tasks, notes, and a final check-in three weeks out. It’s all in one spot.',
    ],
    outro: 'That’s it — booked, budgeted, and sorted.',
  },
  checklist: {
    intro: 'Here’s how to use the checklist, and get your helpers on board.',
    steps: [
      'Open the Wedding planner, then Checklist. It’s the usual Aussie plan, counted back from your date, including the Notice of Intended Marriage.',
      'Hand a task to family or a friend. They get a private link to their own list, and can tick things off themselves.',
      'The last month and the day itself are in there too. Tap a job, then Who’s doing it, and hand it to someone.',
      'On their page, they can tap Add my jobs to my calendar. Everything that’s theirs goes in their phone, with reminders.',
    ],
    outro: 'That’s it. Many hands make light work.',
  },
  party: {
    intro: 'Here’s how to set up your wedding party.',
    steps: [
      'Open Wedding party. Under each side, tap Add, choose their role, and type their name. Pick them from your guest list, or add someone new.',
      'In Links and sign-ins, send each of them their own sign-in. Then choose what they can see, like the run sheet, or their to-dos.',
      'Write the run sheet and packing list just once. Each person only sees their own part.',
    ],
    outro: 'That’s it — your crew’s ready to go.',
  },
  'text-credits': {
    intro: 'Here’s how texts are paid for. They aren’t included in your plan.',
    steps: [
      'Sending from your own phone, or by email, is always free. Automatic texts need text credits, which you buy separately.',
      'Open Settings, then Texting, and type how many guests you’ll text. It works out the credits, and shows the total, all-in, before you pay.',
      'Tap Buy, and pay by card. The credits never expire, and nothing is ever charged unless you choose to buy.',
    ],
    outro: 'That’s it. You only pay for the texts you need.',
  },
  drive: {
    intro: 'Here’s how to connect your Google Drive.',
    steps: [
      'Open Photos, and tap Connect Google Drive. Choose your account, and allow access. It can only see the folder it makes, nothing else.',
      'A wedding folder appears in your Drive, with photos, planning files, and backups. Any photos already taken are copied straight across.',
      'If it ever says Needs reconnecting, maybe after a password change, just tap Reconnect. It picks up where it left off.',
    ],
    outro: 'That’s it. Everything’s safe in your own Drive.',
  },
  photos: {
    intro: 'Here’s how guests share their photos with you.',
    steps: [
      'Open Photos, then Photo settings, and connect Google Drive, Dropbox, or OneDrive. Everything gets filed in folders for you.',
      'Next, print your table numbers, or the Snap and share cards. Each one has a QR code.',
      'Guests scan it, pop in their name, pick a frame, and snap away. Straight into your album. No app needed.',
    ],
    outro: 'That’s it — every moment, from every angle.',
  },
  guide: {
    intro: 'Here’s how to set up the night-before guide.',
    steps: [
      'In Setup, open the Night-before page. Add the run sheet, arrival time, parking, the menu, and your FAQ.',
      'The night before, every guest gets a text with their own guide. Their table, the menu, and a map.',
      'And your FAQ does double duty. It’s also how texted questions get answered for you.',
    ],
    outro: 'That’s it. Fewer questions on the day.',
  },
  rehearsal: {
    intro: 'Here’s how to rehearse your whole wedding, without sending a single thing.',
    steps: [
      'Tap Rehearse your wedding day on the Overview. It runs your wedding as a dry run, with your real guests and words. Nothing is sent, and nothing is saved.',
      'The checklist shows each area in green, amber or red. Tap Fix it beside anything that would go wrong, and it takes you straight there.',
      'Now move along the timeline. From the invitations going out, through reminders and the night before, to the ceremony and the morning after.',
      'At each moment you see every message, in its real words. Pick a guest who said yes, said no, or hasn’t replied, and see their page as it looks then.',
      'You’ll see what the wedding party and your coordinator see, too. Run it again after each fix, until it’s all green.',
    ],
    outro: 'That’s your dress rehearsal done. No surprises on the day.',
  },
  calendar: {
    intro: 'Here’s how to get everything into everyone’s calendars.',
    steps: [
      'On their invitation, guests tap All my events. Everything goes in their phone’s calendar, and stays up to date.',
      'In the checklist, switch on your planning calendar. Tasks and payments that are due show up in your own calendar.',
      'And to put the admin on your phone, open your browser’s menu, and choose Add to Home Screen.',
    ],
    outro: 'That’s it — nobody misses a thing.',
  },
  backup: {
    intro: 'Here’s how your wedding is kept safe.',
    steps: [
      'Connect Google Drive, Dropbox, or OneDrive, in Photo settings. A full backup goes to your Backups folder every day.',
      'In Settings, then Backup, you can back up any time, or download everything as one file.',
      'Each wedding is kept completely separate. Only the people you invite can see yours.',
    ],
    outro: 'That’s it. Your plans are safe and sound.',
  },
  ceremony: {
    intro: 'Here’s how to plan your ceremony with your celebrant, and keep the legal paperwork on track.',
    steps: [
      'Open the Wedding planner, then Ceremony. Invite your celebrant in Settings, and choose Celebrant. Your ceremony is the first thing they see.',
      'Your celebrant can attach their questionnaire, or ask the questions right here. You each answer on your own, then tick yours ready.',
      'The Notice of Intended Marriage has to reach your celebrant at least a month before the day. Your dates are worked out for you.',
      'On the day, you need two witnesses over eighteen. Afterwards, your celebrant registers the marriage, and you order the official certificate.',
      'Then shape the ceremony itself. The order, readings, music and your vows. Mark your vows private, and only you will see them.',
    ],
    outro: 'That’s it. Your celebrant always has the final word on the paperwork.',
  },
  seal: {
    intro: 'Here’s how to choose your wax seal, and the colour of your envelope.',
    steps: [
      'Open Setup, then Invitation. Under Extras, tap Envelope and seal. A little envelope shows your choice as it is now.',
      'Pick the wax colour, from classic sandstone to rose gold, silver, navy or black. Then the design: your initials, a pressed flower, a wreath, one initial, a heart, or your wedding date.',
      'Choose flowing script or serif capitals for the letters. Or type your own words for the seal. Leave it empty, and it shows your initials.',
      'Last, the envelope colour. Cream, blush pink, sage, navy, kraft and more. The preview follows as it saves, so tap the envelope to watch it open.',
    ],
    outro: 'That’s it — your seal, your colours.',
  },
  helpers: {
    intro: 'Here’s how to share the admin with your partner, or your planner.',
    steps: [
      'Go to Settings, and invite them by email. They can be an owner, an editor who can change things, or a viewer who can just look.',
      'They set their own passcode. And if you ever remove them, they’re signed out straight away.',
    ],
    outro: 'That’s it — planning’s better together.',
  },
};

/**
 * The words for one part of a guide: step -1 is the intro, then each step; the last step ends with the
 * outro. Null for anything else, so only these known lines are ever turned into speech.
 */
export function helpSayLine(id: string, step: number): string | null {
  const s = Object.prototype.hasOwnProperty.call(HELP_SAY, id) ? HELP_SAY[id] : undefined;
  if (!s || !Number.isInteger(step)) return null;
  if (step === -1) return s.intro;
  const line = s.steps[step];
  if (line === undefined) return null;
  return step === s.steps.length - 1 ? `${line} ${s.outro}` : line;
}

/** Plain words for a voice: curly quotes and arrows read badly. */
export function speakable(text: string): string {
  return text.replace(/[“”"]/g, '').replace(/\s*→\s*/g, ', then ').replace(/\s+/g, ' ').trim();
}

/** A short, stable fingerprint of a line (and the voice), so an edited line is a new address, never a stale copy. */
export function helpSayVersion(text: string, voice: { model: string; speaker: string } = HELP_VOICE): string {
  let h = 0x811c9dc5;
  for (const ch of `${voice.model}|${voice.speaker}|${text}`) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Where the walkthrough fetches the recorded voice for one part of a guide (null: no line for it). */
export function helpVoiceUrl(id: string, step: number): string | null {
  const text = helpSayLine(id, step);
  return text === null ? null : `/api/a/help/voice?id=${encodeURIComponent(id)}&step=${step}&v=${helpSayVersion(speakable(text))}`;
}
