/** Guest groups (seating colours, filters and auto-seat). Suggestions come from the couple's own names. */

const first = (s: string) => s.trim().split(/\s+/)[0] ?? s;

export function groupSuggestions(w: { name1: string; name2: string } | undefined): string[] {
  const a = w ? first(w.name1) : 'Partner one';
  const b = w ? first(w.name2) : 'Partner two';
  return [`${a}'s side`, `${b}'s side`, `${a}'s family`, `${b}'s family`, `${a}'s friends`, `${b}'s friends`, 'Wedding party', 'Family', 'Friends', 'Work', 'Kids'];
}

/** A steady colour per group, so a group looks the same everywhere. */
const PALETTE = ['#8a9670', '#b39563', '#7d8aa6', '#a07a8c', '#6f9a94', '#c08a5b', '#8c7fb0', '#9a8f63'];
export function groupColour(group: string): string {
  if (!group) return '#c6b794';
  let h = 0;
  for (const ch of group.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}
