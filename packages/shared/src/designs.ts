/**
 * Invitation templates: twenty complete named looks, covering the most-chosen wedding styles (colours, how the names are set, the envelope and seal) with
 * a matching set of words in their own tone. Couples can start from one and then mix and match any part
 * (Black Tie colours with Coastal wording and a script for the names), so every part here stands alone.
 *
 * Plain data, no browser code: the admin's builder, the theme kit and (later) the front page all read it.
 * Every template is on every plan: designs are what bring couples in.
 */

export type NamesFont = 'script' | 'caps' | 'vibes' | 'parisienne' | 'playfair';
/** The wax seal's colours and finishes (the first three are the originals; the rest are newer). */
export const SEAL_COLOURS = [
  'Sandstone', 'Dusty rose', 'Daphne blue', 'Rose gold', 'Gold', 'Silver', 'Champagne', 'Pearl white',
  'Burgundy', 'Forest green', 'Sage', 'Navy', 'Black', 'Terracotta', 'Lilac',
] as const;
export type SealColour = (typeof SEAL_COLOURS)[number];
/** What is pressed into the seal: the couple's initials (classic), a flower, initials in a wreath, one letter, a heart, or the date. */
export const SEAL_STYLES = ['classic', 'floral', 'wreath', 'single', 'heart', 'date'] as const;
export type SealStyle = (typeof SEAL_STYLES)[number];
export const SEAL_STYLE_INFO: Record<SealStyle, { label: string; hint: string }> = {
  classic: { label: 'Classic initials', hint: 'Your initials, as on a traditional seal' },
  floral: { label: 'Floral emboss', hint: 'A pressed flower with leaves' },
  wreath: { label: 'Initials in a wreath', hint: 'Your initials inside a ring of leaves' },
  single: { label: 'Single initial', hint: 'One letter, large' },
  heart: { label: 'Heart', hint: 'A raised heart' },
  date: { label: 'The date', hint: 'Your wedding date, like 20.03.27' },
};
/** How the letters on the seal are cut: flowing italic (as it always was) or upright serif capitals. */
export const SEAL_LETTERS = ['script', 'serif'] as const;
export type SealLetters = (typeof SEAL_LETTERS)[number];
/** The envelope's paper, by name (unset: the look's own envelope colour). */
export const ENVELOPE_PAPERS = [
  'cream', 'ivory', 'champagne', 'blush', 'dustyrose', 'sage', 'eucalyptus', 'dustyblue', 'navy', 'midnight', 'terracotta', 'kraft',
] as const;
export type EnvelopePaper = (typeof ENVELOPE_PAPERS)[number];
export const ENVELOPE_PAPER_INFO: Record<EnvelopePaper, { label: string; hex: string }> = {
  cream: { label: 'Cream', hex: '#efe5d1' },
  ivory: { label: 'Ivory', hex: '#f7f3e8' },
  champagne: { label: 'Champagne', hex: '#e8d8b9' },
  blush: { label: 'Blush pink', hex: '#f1d8d3' },
  dustyrose: { label: 'Dusty rose', hex: '#d6aaa7' },
  sage: { label: 'Sage', hex: '#c3cdb2' },
  eucalyptus: { label: 'Eucalyptus', hex: '#93ab9f' },
  dustyblue: { label: 'Dusty blue', hex: '#b4c4d3' },
  navy: { label: 'Navy', hex: '#24334f' },
  midnight: { label: 'Midnight black', hex: '#1e1e23' },
  terracotta: { label: 'Terracotta', hex: '#c27458' },
  kraft: { label: 'Kraft', hex: '#c3a479' },
};
export type Liner = 'none' | 'floral' | 'eucalyptus' | 'stripes' | 'confetti' | 'foil';
export type Ribbon = 'none' | 'silk' | 'twine';
export type ToneFeel = 'Formal' | 'Relaxed' | 'Warm' | 'Playful' | 'Poetic';

/** The five colours every look is worked out from. */
export interface DesignPalette {
  paper: string;
  ink: string;
  accent: string;
  soft: string;
  envelope: string;
}

/** The envelope's finishing touches, as the invitation draws them. */
export interface EnvelopeLook {
  seal: SealColour;
  liner: Liner;
  ribbon: Ribbon;
  shimmer: boolean;
  sprig: boolean;
}

/**
 * The pieces of wording a tone sets, and where each sits in the text catalogue. Only {names} (the guest's
 * names) is filled in; everything else reads as written.
 */
export const WORDING_KEYS = {
  /** The button on the closed envelope. */
  envelope: 'inv.8b5cd45d',
  /** The line above the couple's names. */
  invite: 'inv.f3262251',
  /** The greeting to a guest who opened their own link. */
  greet: 'inv.dyn.greet',
  /** The greeting to a visitor without their link. */
  greetAnon: 'inv.dyn.greetAnon',
  countdown: 'inv.73032d03',
  /** The RSVP heading. */
  rsvp: 'inv.6e6bcef1',
  yes: 'inv.afa7388c',
  no: 'inv.886f3d40',
  send: 'inv.ab33f929',
  thanks: 'inv.7a7c46aa',
  thanksYes: 'inv.dyn.thanksYes',
  thanksNo: 'inv.dyn.thanksNo',
  gift: 'inv.b7af7eaa',
  /** The night-before page: follows "Dear [name]", so it starts with a comma. */
  guideIntro: 'gd.b39e3583',
  /** The night-before page's sign-off. */
  signOff: 'gd.39c92f66',
} as const;
export type WordingPart = keyof typeof WORDING_KEYS;

export interface Tone {
  id: string;
  label: string;
  feel: ToneFeel;
  words: Record<WordingPart, string>;
}

export const TONES: Tone[] = [
  {
    id: 'crisp',
    label: 'Clean and simple',
    feel: 'Relaxed',
    words: {
      envelope: 'Open',
      invite: 'Join us for the wedding of',
      greet: 'Hello {names}',
      greetAnon: 'Hello',
      countdown: 'Days to go',
      rsvp: 'Can you make it?',
      yes: "Yes, I'm in",
      no: "Sorry, I can't",
      send: 'Send reply',
      thanks: 'Thanks',
      thanksYes: 'Got it. See you there.',
      thanksNo: 'Got it. You will be missed.',
      gift: 'Gifts',
      guideIntro: ', here is everything for tomorrow.',
      signOff: 'See you soon',
    },
  },
  {
    id: 'breezy',
    label: 'Easy-going',
    feel: 'Relaxed',
    words: {
      envelope: 'Open your invitation',
      invite: 'Come and celebrate the wedding of',
      greet: 'Hi {names}',
      greetAnon: 'Hi there',
      countdown: 'Until we tie the knot',
      rsvp: 'Will you be there?',
      yes: 'Count me in',
      no: "I'll miss this one",
      send: 'Send my reply',
      thanks: 'Thank you',
      thanksYes: "Wonderful! We can't wait to see you there.",
      thanksNo: "We will miss you, and we'll raise a glass to you.",
      gift: 'A note on gifts',
      guideIntro: ', here is all you need for tomorrow. Relax, we have it covered.',
      signOff: 'Fair winds and love, from us both',
    },
  },
  {
    id: 'joyful',
    label: 'Warm and joyful',
    feel: 'Warm',
    words: {
      envelope: 'Open invitation',
      invite: 'With joyful hearts, we invite you to the wedding of',
      greet: 'Dear {names}',
      greetAnon: 'Dear friend',
      countdown: 'Until we say I do',
      rsvp: 'Will you join us for the celebration?',
      yes: 'Joyfully accepts',
      no: 'Regretfully declines',
      send: 'Send our reply',
      thanks: 'Thank you',
      thanksYes: 'Your reply made our day. We cannot wait to celebrate with you.',
      thanksNo: 'We are sorry you cannot be there. You will be with us in spirit.',
      gift: 'With gratitude',
      guideIntro: ', here is everything you need for tomorrow. We are so glad you are coming.',
      signOff: 'With love and blossoms, from us both',
    },
  },
  {
    id: 'formal',
    label: 'Traditional and formal',
    feel: 'Formal',
    words: {
      envelope: 'Open invitation',
      invite: 'The honour of your presence is requested at the marriage of',
      greet: 'Dear {names}',
      greetAnon: 'Dear Guest',
      countdown: 'Until the ceremony',
      rsvp: 'Kindly reply',
      yes: 'Accepts with pleasure',
      no: 'Declines with regret',
      send: 'Send reply',
      thanks: 'Thank you',
      thanksYes: 'Your acceptance has been received with great pleasure.',
      thanksNo: 'Your reply has been received. You will be missed.',
      gift: 'Gifts',
      guideIntro: ', please find below everything you need for tomorrow.',
      signOff: 'With warmest regards',
    },
  },
  {
    id: 'wander',
    label: 'Free-spirited',
    feel: 'Poetic',
    words: {
      envelope: 'Open me',
      invite: 'Under open skies, two hearts become one. Join us for the wedding of',
      greet: 'Dear {names}',
      greetAnon: 'Dear wanderer',
      countdown: 'Until we wed',
      rsvp: 'Will you wander with us?',
      yes: "Wouldn't miss it",
      no: 'Sending love from afar',
      send: 'Send with love',
      thanks: 'With thanks',
      thanksYes: 'Your reply is in. We cannot wait to dance with you.',
      thanksNo: 'We will miss you, and we will feel your love from afar.',
      gift: 'If you wish to give',
      guideIntro: ', here is everything for tomorrow. Bring your dancing shoes.',
      signOff: 'Peace, love and see you soon',
    },
  },
  {
    id: 'country',
    label: 'Down to earth',
    feel: 'Warm',
    words: {
      envelope: 'Open invitation',
      invite: 'Pull up a chair and join us for the wedding of',
      greet: 'Dear {names}',
      greetAnon: 'Dear friend',
      countdown: 'Until the big day',
      rsvp: 'Will you raise a glass with us?',
      yes: 'Save me a seat',
      no: "Can't make it this time",
      send: 'Send reply',
      thanks: 'Cheers!',
      thanksYes: "Cheers! We'll save you a seat at the long table.",
      thanksNo: "We will miss you, and we'll pour one in your honour.",
      gift: 'Gifts',
      guideIntro: ', here is everything you need for tomorrow. Wear comfortable shoes.',
      signOff: 'Cheers, and love from us both',
    },
  },
  {
    id: 'glamour',
    label: 'Glamorous',
    feel: 'Formal',
    words: {
      envelope: 'Open invitation',
      invite: 'You are cordially invited to celebrate the marriage of',
      greet: 'Dear {names}',
      greetAnon: 'Dear Guest',
      countdown: 'Until the party of the year',
      rsvp: 'Will you join the celebration?',
      yes: 'With bells on',
      no: 'Regretfully, no',
      send: 'Send reply',
      thanks: 'Splendid',
      thanksYes: 'Splendid! Polish your shoes: we will see you on the dance floor.',
      thanksNo: 'We will miss you terribly, and we will toast to you.',
      gift: 'Gifts',
      guideIntro: ', here is everything you need for tomorrow.',
      signOff: 'Until the dance floor, with love',
    },
  },
  {
    id: 'sunny',
    label: 'Sunny and fun',
    feel: 'Playful',
    words: {
      envelope: 'Tap to open',
      invite: 'Pack your party shoes: you are invited to the wedding of',
      greet: 'Hey {names}',
      greetAnon: 'Hey there',
      countdown: 'Until the party starts',
      rsvp: 'Are you in?',
      yes: 'Totally in',
      no: 'Sadly out',
      send: 'Send it',
      thanks: 'Woohoo!',
      thanksYes: 'Woohoo! See you on the dance floor.',
      thanksNo: 'Oh no! We will miss you.',
      gift: 'Gifts',
      guideIntro: ', here is everything for tomorrow. Sunscreen recommended.',
      signOff: 'Big love, see you there',
    },
  },
  {
    id: 'candlelit',
    label: 'Candlelit',
    feel: 'Poetic',
    words: {
      envelope: 'Open invitation',
      invite: 'By candlelight and starlight, we invite you to the wedding of',
      greet: 'Dear {names}',
      greetAnon: 'Dear friend',
      countdown: 'Until we say I do',
      rsvp: 'Will you share the day with us?',
      yes: 'Joyfully, yes',
      no: 'Sadly, no',
      send: 'Send reply',
      thanks: 'Thank you',
      thanksYes: 'Your reply warms our hearts. We cannot wait to see you.',
      thanksNo: 'We are sorry you cannot be with us. You will be in our thoughts.',
      gift: 'With gratitude',
      guideIntro: ', here is everything you need for tomorrow. Bring something warm.',
      signOff: 'With love and starlight',
    },
  },
  {
    id: 'cheeky',
    label: 'Cheeky',
    feel: 'Playful',
    words: {
      envelope: 'Open me!',
      invite: 'Big news! You are invited to the wedding of',
      greet: 'Hi {names}!',
      greetAnon: 'Hi there!',
      countdown: 'Until we get hitched',
      rsvp: 'So... are you coming?',
      yes: 'Obviously!',
      no: 'Sadly not',
      send: 'Send my reply',
      thanks: 'Yay!',
      thanksYes: 'Yay! Get your dancing shoes ready.',
      thanksNo: 'Boo! We will miss you, but we understand.',
      gift: 'Gifts',
      guideIntro: ', here is everything for tomorrow. Get ready to party!',
      signOff: 'Lots of love (and cake)',
    },
  },
  {
    id: 'romantic',
    label: 'Romantic',
    feel: 'Warm',
    words: {
      envelope: 'Open invitation',
      invite: 'Together with their families, you are invited to the wedding of',
      greet: 'Dearest {names}',
      greetAnon: 'Dearest friend',
      countdown: 'Until forever begins',
      rsvp: 'Will you be there to share our joy?',
      yes: 'Joyfully accepts',
      no: 'Regretfully declines',
      send: 'Send with love',
      thanks: 'With love',
      thanksYes: 'Your reply means the world. We cannot wait to celebrate with you.',
      thanksNo: 'You will be missed, and you will be in our hearts on the day.',
      gift: 'With gratitude',
      guideIntro: ', here is everything you need for tomorrow. We cannot wait to see you.',
      signOff: 'All our love',
    },
  },
  {
    id: 'vintage',
    label: 'Old-world charm',
    feel: 'Formal',
    words: {
      envelope: 'Open invitation',
      invite: 'The pleasure of your company is requested at the marriage of',
      greet: 'My dear {names}',
      greetAnon: 'My dear friend',
      countdown: 'Until the happy day',
      rsvp: 'The favour of a reply is requested',
      yes: 'Delighted to attend',
      no: 'Unable to attend',
      send: 'Send reply',
      thanks: 'With thanks',
      thanksYes: 'How delightful. We look forward to seeing you.',
      thanksNo: 'We are sorry to miss you, and thank you for letting us know.',
      gift: 'Gifts',
      guideIntro: ', here is everything you need for tomorrow.',
      signOff: 'Yours, with affection',
    },
  },
  {
    id: 'fairytale',
    label: 'Once upon a time',
    feel: 'Poetic',
    words: {
      envelope: 'Open the invitation',
      invite: 'Once upon a time, two hearts found each other. Join us for the wedding of',
      greet: 'Dear {names}',
      greetAnon: 'Dear friend',
      countdown: 'Until happily ever after',
      rsvp: 'Will you join our happily ever after?',
      yes: 'I shall attend',
      no: 'Alas, I cannot',
      send: 'Send my reply',
      thanks: 'Thank you',
      thanksYes: 'Hooray! Your seat at the feast is saved.',
      thanksNo: 'Alas! We will miss you, and we will raise a toast in your name.',
      gift: 'Gifts',
      guideIntro: ', here is everything you need for tomorrow. The story continues.',
      signOff: 'Happily ever after, from us both',
    },
  },
  {
    id: 'celestial',
    label: 'Written in the stars',
    feel: 'Poetic',
    words: {
      envelope: 'Open invitation',
      invite: 'It was written in the stars. Join us for the wedding of',
      greet: 'Dear {names}',
      greetAnon: 'Dear friend',
      countdown: 'Until our stars align',
      rsvp: 'Will you celebrate with us?',
      yes: 'Over the moon to come',
      no: 'Sadly, I cannot',
      send: 'Send reply',
      thanks: 'Thank you',
      thanksYes: 'Over the moon! We cannot wait to see you.',
      thanksNo: 'We will miss you, and we will wish on a star for you.',
      gift: 'With gratitude',
      guideIntro: ', here is everything you need for tomorrow.',
      signOff: 'To the moon and back, from us both',
    },
  },
];

/**
 * How the envelope opens. All CSS transitions on the envelope the invitation already draws (no extra
 * downloads), and a quick plain fade for guests whose phone asks for less motion.
 */
/**
 * Moving scenes over the opening of the invitation (our own animation, drawn in the page): 'auto' is the
 * look's own (petals for Romantic, leaves for Garden, shimmer for Coastal, sparkle for Luxe, none otherwise).
 */
export const MOTIONS = ['auto', 'none', 'petals', 'leaves', 'lights', 'sparkle', 'confetti', 'snow', 'shimmer'] as const;
export type Motion = (typeof MOTIONS)[number];
export const MOTION_LABEL: Record<Motion, string> = {
  auto: 'The look’s own',
  none: 'None',
  petals: 'Falling rose petals',
  leaves: 'Drifting leaves',
  lights: 'Fairy lights',
  sparkle: 'Gold sparkle',
  confetti: 'Confetti',
  snow: 'Soft snow',
  shimmer: 'Sunlight shimmer',
};

/**
 * Opening scenes: the whole screen is a scene the guest opens with a tap, in place of the envelope (our own
 * artwork: guest/invitation/Scene.tsx). 'auto' is the design's own (the Signature designs have one).
 */
export const SCENES = ['auto', 'none', 'doors', 'barn', 'book', 'gates', 'beach', 'bow', 'curtain', 'lanterns', 'vellum', 'photo'] as const;
export type Scene = (typeof SCENES)[number];
export const SCENE_INFO: Record<Scene, { label: string; hint: string }> = {
  auto: { label: 'The design’s own', hint: 'The scene that comes with the design (the envelope when it has none)' },
  none: { label: 'The envelope', hint: 'The envelope and wax seal' },
  doors: { label: 'Regency doors', hint: 'Pressed floral doors; the wax seal splits and they swing open' },
  bow: { label: 'Satin bow', hint: 'A satin bow and pearl untie, and the ribbons slide away' },
  curtain: { label: 'Velvet curtains', hint: 'Theatre curtains draw apart' },
  barn: { label: 'Barn doors', hint: 'Timber barn doors with a eucalyptus wreath roll apart' },
  book: { label: 'Storybook', hint: 'A gilded storybook opens to its first page' },
  gates: { label: 'Garden gates', hint: 'Iron garden gates swing open onto a sunny garden' },
  beach: { label: 'Beach', hint: 'A wave washes over your initials in the sand' },
  lanterns: { label: 'Evening lanterns', hint: 'Lanterns rise over a garden at night (for an evening wedding)' },
  vellum: { label: 'Vellum & gold', hint: 'Sheets of frosted vellum lift away one by one to a gilt card' },
  photo: { label: 'Your photograph', hint: 'Your photo develops from pale to full colour, then lifts away to the invitation (uses the photo in Extras → Photo)' },
};

export const OPENINGS = ['classic', 'crack', 'stamp', 'gatefold', 'slide', 'letterpress', 'ribbon', 'petals', 'confetti', 'golddust', 'stars'] as const;
export type Opening = (typeof OPENINGS)[number];
export const OPENING_INFO: Record<Opening, { label: string; hint: string }> = {
  classic: { label: 'Classic', hint: 'The seal pops, the flaps lift, the card rises' },
  crack: { label: 'Seal crack', hint: 'The seal cracks and drops away, then the flaps open' },
  stamp: { label: 'Wax stamp', hint: 'The seal presses down and melts away' },
  gatefold: { label: 'Gatefold', hint: 'The sides swing open like doors and the card unfolds' },
  slide: { label: 'Card slides up', hint: 'The top flap lifts and the card slides up out of the envelope' },
  letterpress: { label: 'Letterpress', hint: 'A quiet fade: the envelope lifts away and the card presses into view' },
  ribbon: { label: 'Ribbon untie', hint: 'The ribbon slips off either side before the flaps open' },
  petals: { label: 'Petal shower', hint: 'Petals in your colours drift down as it opens' },
  confetti: { label: 'Confetti', hint: 'A burst of confetti in your colours' },
  golddust: { label: 'Gold dust', hint: 'A burst of fine gold sparkles' },
  stars: { label: 'Starry shimmer', hint: 'Tiny silver stars drift down slowly' },
};

/** Which parts of the invitation a template shows: everything, or a shorter card. */
export type SectionSet = 'full' | 'short';

export interface DesignTemplate {
  name: string;
  /** A few words on the feel, for the card. */
  style: string;
  mood: 'Classic' | 'Romantic' | 'Garden & rustic' | 'Coastal & bright' | 'Moody & luxe' | 'Modern';
  palette: DesignPalette;
  names: NamesFont;
  envelope: EnvelopeLook;
  /** The id of its wording set in TONES. */
  tone: string;
  sections: SectionSet;
  /** How its envelope opens (couples can pick any). */
  opening: Opening;
}

export const TEMPLATES: DesignTemplate[] = [
  {
    name: 'Gallery White',
    style: 'Modern minimal: crisp white, black ink',
    mood: 'Modern',
    palette: { paper: '#fdfdfb', ink: '#1c1c1c', accent: '#9a9a94', soft: '#e9e9e5', envelope: '#efefeb' },
    names: 'caps',
    envelope: { seal: 'Daphne blue', liner: 'none', ribbon: 'none', shimmer: false, sprig: false },
    tone: 'crisp',
    sections: 'short',
    opening: 'letterpress',
  },
  {
    name: 'Sea Glass',
    style: 'Coastal: soft aqua, deep teal',
    mood: 'Coastal & bright',
    palette: { paper: '#f5f9f8', ink: '#24464f', accent: '#7fa9a1', soft: '#cfe5e1', envelope: '#dcebe8' },
    names: 'parisienne',
    envelope: { seal: 'Daphne blue', liner: 'stripes', ribbon: 'twine', shimmer: false, sprig: false },
    tone: 'breezy',
    sections: 'full',
    opening: 'slide',
  },
  {
    name: 'Garden Party',
    style: 'Florals, petal pink, leafy green',
    mood: 'Garden & rustic',
    palette: { paper: '#fcf8f3', ink: '#3d4a36', accent: '#c98a9a', soft: '#f0d9dc', envelope: '#f1e4e0' },
    names: 'vibes',
    envelope: { seal: 'Dusty rose', liner: 'floral', ribbon: 'silk', shimmer: false, sprig: true },
    tone: 'joyful',
    sections: 'full',
    opening: 'petals',
  },
  {
    name: 'Gala Black & Gold',
    style: 'Black tie: black ink, gold foil',
    mood: 'Moody & luxe',
    palette: { paper: '#f8f6f1', ink: '#111111', accent: '#b8913f', soft: '#d9d3c4', envelope: '#e2dccf' },
    names: 'caps',
    envelope: { seal: 'Sandstone', liner: 'foil', ribbon: 'silk', shimmer: true, sprig: true },
    tone: 'formal',
    sections: 'full',
    opening: 'golddust',
  },
  {
    name: 'Desert Bloom',
    style: 'Boho: terracotta, sand, dried flowers',
    mood: 'Garden & rustic',
    palette: { paper: '#faf1e8', ink: '#5a2e1f', accent: '#c4703f', soft: '#efcdb5', envelope: '#e9c8ad' },
    names: 'parisienne',
    envelope: { seal: 'Sandstone', liner: 'floral', ribbon: 'twine', shimmer: false, sprig: false },
    tone: 'wander',
    sections: 'full',
    opening: 'ribbon',
  },
  {
    name: 'Vineyard Harvest',
    style: 'Rustic: wine red, kraft, vines',
    mood: 'Garden & rustic',
    palette: { paper: '#f7f0e6', ink: '#4b2433', accent: '#8c6d3f', soft: '#dcc7b0', envelope: '#d8c3a5' },
    names: 'script',
    envelope: { seal: 'Dusty rose', liner: 'eucalyptus', ribbon: 'twine', shimmer: false, sprig: true },
    tone: 'country',
    sections: 'full',
    opening: 'crack',
  },
  {
    name: 'Art Deco Gilt',
    style: 'Art deco: gold geometry, deep teal',
    mood: 'Moody & luxe',
    palette: { paper: '#f6f2e8', ink: '#1b2a2f', accent: '#c9a24a', soft: '#d8d0bb', envelope: '#e2dac6' },
    names: 'playfair',
    envelope: { seal: 'Sandstone', liner: 'stripes', ribbon: 'none', shimmer: true, sprig: false },
    tone: 'glamour',
    sections: 'full',
    opening: 'gatefold',
  },
  {
    name: 'Tropical Palm',
    style: 'Tropical: palm green, coral',
    mood: 'Coastal & bright',
    palette: { paper: '#fbfaf2', ink: '#1f4a3a', accent: '#e08a5b', soft: '#cfe6d4', envelope: '#e6f0dc' },
    names: 'vibes',
    envelope: { seal: 'Dusty rose', liner: 'eucalyptus', ribbon: 'none', shimmer: false, sprig: false },
    tone: 'sunny',
    sections: 'full',
    opening: 'confetti',
  },
  {
    name: 'Midnight Winter',
    style: 'Winter: midnight blue, silver',
    mood: 'Classic',
    palette: { paper: '#f4f6fa', ink: '#16213e', accent: '#a8b4c8', soft: '#d5dcea', envelope: '#dfe4ee' },
    names: 'script',
    envelope: { seal: 'Daphne blue', liner: 'foil', ribbon: 'silk', shimmer: true, sprig: true },
    tone: 'candlelit',
    sections: 'full',
    opening: 'stars',
  },
  {
    name: 'Sorbet Pastel',
    style: 'Playful pastels: peach, lilac, pink',
    mood: 'Romantic',
    palette: { paper: '#fffaf6', ink: '#4a3a5c', accent: '#e79bb0', soft: '#e6dcf5', envelope: '#fde6d8' },
    names: 'playfair',
    envelope: { seal: 'Dusty rose', liner: 'confetti', ribbon: 'silk', shimmer: false, sprig: false },
    tone: 'cheeky',
    sections: 'short',
    opening: 'confetti',
  },
  {
    name: 'Timeless Romance',
    style: 'Classic romantic: blush, wine, gold',
    mood: 'Romantic',
    palette: { paper: '#fdf8f5', ink: '#4a2c32', accent: '#c3a07a', soft: '#f0d8d6', envelope: '#f3e4df' },
    names: 'script',
    envelope: { seal: 'Dusty rose', liner: 'floral', ribbon: 'silk', shimmer: true, sprig: true },
    tone: 'romantic',
    sections: 'full',
    opening: 'petals',
  },
  {
    name: 'Vintage Lace',
    style: 'Vintage: antique cream, sepia',
    mood: 'Classic',
    palette: { paper: '#f7f1e3', ink: '#4a3b2a', accent: '#a88a5c', soft: '#e3d6bc', envelope: '#e8dcc4' },
    names: 'parisienne',
    envelope: { seal: 'Sandstone', liner: 'floral', ribbon: 'twine', shimmer: false, sprig: true },
    tone: 'vintage',
    sections: 'full',
    opening: 'stamp',
  },
  {
    name: 'Enchanted Castle',
    style: 'Fairytale: lilac, royal purple, gold',
    mood: 'Romantic',
    palette: { paper: '#faf7fb', ink: '#3a2d5c', accent: '#c7a35a', soft: '#ddd3ec', envelope: '#e9e2f2' },
    names: 'vibes',
    envelope: { seal: 'Sandstone', liner: 'foil', ribbon: 'silk', shimmer: true, sprig: true },
    tone: 'fairytale',
    sections: 'full',
    opening: 'golddust',
  },
  {
    name: 'Passport & Postcards',
    style: 'Destination: airmail navy and red',
    mood: 'Coastal & bright',
    palette: { paper: '#fbf8f1', ink: '#23395b', accent: '#c0603e', soft: '#d7e0ea', envelope: '#efe4cf' },
    names: 'playfair',
    envelope: { seal: 'Sandstone', liner: 'stripes', ribbon: 'twine', shimmer: false, sprig: false },
    tone: 'breezy',
    sections: 'full',
    opening: 'slide',
  },
  {
    name: 'Warehouse Loft',
    style: 'Industrial: concrete grey, copper',
    mood: 'Modern',
    palette: { paper: '#f3f2ef', ink: '#2b2b2b', accent: '#9a6b4a', soft: '#d6d3cc', envelope: '#cfcac0' },
    names: 'caps',
    envelope: { seal: 'Sandstone', liner: 'none', ribbon: 'twine', shimmer: false, sprig: false },
    tone: 'crisp',
    sections: 'short',
    opening: 'crack',
  },
  {
    name: 'Mediterranean Olive',
    style: 'Mediterranean: olive, sea blue, whitewash',
    mood: 'Coastal & bright',
    palette: { paper: '#fbf9f2', ink: '#2c4a6e', accent: '#8a9a5b', soft: '#dbe4d0', envelope: '#eef0e3' },
    names: 'parisienne',
    envelope: { seal: 'Daphne blue', liner: 'eucalyptus', ribbon: 'twine', shimmer: false, sprig: true },
    tone: 'joyful',
    sections: 'full',
    opening: 'gatefold',
  },
  {
    name: 'Cottage Meadow',
    style: 'Cottagecore: wildflowers, honey, linen',
    mood: 'Garden & rustic',
    palette: { paper: '#fbf6ec', ink: '#4a4a2e', accent: '#b98b5e', soft: '#e7dcc0', envelope: '#efe3c9' },
    names: 'vibes',
    envelope: { seal: 'Dusty rose', liner: 'floral', ribbon: 'twine', shimmer: false, sprig: true },
    tone: 'country',
    sections: 'full',
    opening: 'petals',
  },
  {
    name: 'Written in the Stars',
    style: 'Celestial: night indigo, gold stars',
    mood: 'Moody & luxe',
    palette: { paper: '#f6f5fb', ink: '#1e1f4b', accent: '#c4a85a', soft: '#d9d8ee', envelope: '#e3e2f1' },
    names: 'playfair',
    envelope: { seal: 'Sandstone', liner: 'foil', ribbon: 'none', shimmer: true, sprig: false },
    tone: 'celestial',
    sections: 'full',
    opening: 'stars',
  },
  {
    name: 'Western Ranch',
    style: 'Western: saddle brown, leather, twine',
    mood: 'Garden & rustic',
    palette: { paper: '#f8f0e4', ink: '#4a2f1d', accent: '#a0703c', soft: '#e6cfae', envelope: '#dcc29e' },
    names: 'caps',
    envelope: { seal: 'Sandstone', liner: 'none', ribbon: 'twine', shimmer: false, sprig: false },
    tone: 'country',
    sections: 'full',
    opening: 'ribbon',
  },
  {
    name: 'Jewel Celebration',
    style: 'Rich jewel tones: ruby, saffron gold',
    mood: 'Moody & luxe',
    palette: { paper: '#fcf6ee', ink: '#5a1424', accent: '#c99a2e', soft: '#f0d3c3', envelope: '#f2dcc8' },
    names: 'playfair',
    envelope: { seal: 'Sandstone', liner: 'confetti', ribbon: 'silk', shimmer: true, sprig: true },
    tone: 'joyful',
    sections: 'full',
    opening: 'confetti',
  },
];

export const templateOf = (name: string | undefined) => TEMPLATES.find((t) => t.name === name);
export const toneOf = (id: string | undefined) => TONES.find((t) => t.id === id);

/** For the front page and sample invitation: each template in a line (name, colours, names font, tone). */
export const DESIGN_LIST = TEMPLATES.map((t) => ({
  name: t.name,
  style: t.style,
  palette: t.palette,
  font: t.names,
  tone: toneOf(t.tone)!.label,
  opening: t.opening,
  feel: toneOf(t.tone)!.feel,
}));

/** A tone's words by catalogue key, ready to save as the wedding's wording. */
export const toneTexts = (tone: Tone): Record<string, string> =>
  Object.fromEntries((Object.keys(WORDING_KEYS) as WordingPart[]).map((p) => [WORDING_KEYS[p], tone.words[p]]));

/** Every word any tone would write for a key: a sentence that reads like one of these wasn't typed by the couple. */
const TONE_WORDS: Map<string, Set<string>> = new Map(
  (Object.keys(WORDING_KEYS) as WordingPart[]).map((p): [string, Set<string>] => [WORDING_KEYS[p], new Set(TONES.map((t) => t.words[p]))]),
);

/**
 * The words the couple typed themselves among a tone's pieces: saved, different from the starting wording
 * and from every tone's. Those are only replaced when they say so.
 */
export function ownWording(texts: Record<string, string>, original: Record<string, string>): string[] {
  return Object.values(WORDING_KEYS).filter((k) => {
    const v = texts[k];
    return v !== undefined && v !== (original[k] ?? '') && !TONE_WORDS.get(k)?.has(v);
  });
}

/**
 * What applying a set of words does: the changes to save, and which of them would replace the couple's own
 * words (asked about first). With keepOwn, their words stay and only the rest change.
 */
export function wordingChanges(
  next: Record<string, string>,
  texts: Record<string, string>,
  original: Record<string, string>,
  keepOwn = false,
): { changes: Record<string, string>; replacesOwn: string[] } {
  const own = new Set(ownWording(texts, original));
  const changes: Record<string, string> = {};
  const replacesOwn: string[] = [];
  for (const [k, v] of Object.entries(next)) {
    const now = texts[k] ?? original[k] ?? '';
    if (now === v) continue;
    if (own.has(k)) {
      replacesOwn.push(k);
      if (keepOwn) continue;
    }
    changes[k] = v;
  }
  return { changes, replacesOwn };
}

/** The design's own wording for the tone's pieces (the "no tone" choice). */
export const originalTexts = (original: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.values(WORDING_KEYS).map((k) => [k, original[k] ?? '']));

// ---------------------------------------------------------------- contrast

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
/** WCAG contrast ratio between two #rrggbb colours (1 to 21; body text wants 4.5 or more). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
