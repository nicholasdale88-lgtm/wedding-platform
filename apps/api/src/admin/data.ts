import { displayPhone } from '@wp/shared';

/** Everything the admin screens show about one wedding, read in one batch. */

export interface AdminEvent {
  id: string;
  key: string;
  name: string;
  pendingLabel: string;
  startsAt: string;
  sort: number;
  hasSeating: boolean;
  catered: boolean;
  venue: string;
  questions: { key: string; label: string; type: string; options?: string[] }[];
}

export interface AdminPerson {
  id: string;
  idx: number;
  name: string;
  diet: string;
  table: string | null;
  /** Their seat at each event: { eventKey: table name }. */
  tables: Record<string, string>;
  /** What they're given at the first event (kept for older screens); `meals` has every event. */
  meal: { entree: string; main: string; dessert: string };
  /** Their meal at each event: { eventKey: { menu (a special menu's id, '' the set menu), and courses changed for them } }. */
  meals: Record<string, { menu: string; entree: string; main: string; dessert: string }>;
  /** Their wedding party role ('' when they aren't in it). */
  role: string;
}

export interface EventReply {
  attending: boolean | null;
  count: number;
  answers: Record<string, string>;
  message: string;
  via: string;
  updatedAt: string;
}

export interface AdminGuest {
  id: string;
  phone: string | null;
  phoneDisplay: string;
  seatsHeld: number;
  /** Group, e.g. "Alex's side" (seating colours and filters). */
  party: string;
  optOut: boolean;
  version: number;
  createdAt: string;
  openedAt: string | null;
  people: AdminPerson[];
  /** Event keys this invitation is invited to. */
  invited: string[];
  rsvp: Record<string, EventReply>;
  repliedAt: string | null;
  lastSms: { name: string; at: string; status: string } | null;
}

export interface WeddingData {
  wedding: {
    id: string;
    slug: string;
    name1: string;
    name2: string;
    timezone: string;
    monogram: string;
    theme: string;
    sender: string | null;
    content: Record<string, unknown>;
    guide: Record<string, unknown>;
  };
  events: AdminEvent[];
  guests: AdminGuest[];
  campaigns: { id: string; key: string; name: string; mode: string; enabled: boolean; audience: string }[];
  slots: { campaignId: string; sendAt: string; status: string; lastError: string | null }[];
  inboxNeedsYou: number;
  tables: { id: string; eventId: string; name: string }[];
}

const json = <T>(s: string | null | undefined, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
};

export async function loadWedding(db: D1Database, weddingId: string): Promise<WeddingData | null> {
  const q = (sql: string) => db.prepare(sql).bind(weddingId);
  const [w, ev, inv, ppl, ie, rs, cp, sl, last, inbox, tb] = await db.batch([
    q(`SELECT id, slug, name1, name2, monogram, theme, timezone, sms_sender, content, guide FROM wedding WHERE id = ? AND deleted_at IS NULL`),
    q(`SELECT id, key, name, pending_label, starts_at, sort, has_seating, catered, venue, questions FROM event WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`),
    q(`SELECT id, phone, seats_held, party, sms_optout, version, created_at, opened_at FROM invitation WHERE wedding_id = ? AND deleted_at IS NULL`),
    // Each person's seat at each event ({ eventKey: table name }); "table" is their first event's.
    q(`SELECT p.id, p.invitation_id, p.idx, p.name, p.diet, p.party_role,
              (SELECT json_group_object(e.key, json_object('menu', m.menu_id, 'entree', m.entree, 'main', m.main, 'dessert', m.dessert))
                 FROM meal_choice m JOIN event e ON e.id = m.event_id AND e.deleted_at IS NULL WHERE m.person_id = p.id) AS meals,
              (SELECT json_group_object(e.key, t.name) FROM seat s JOIN seat_table t ON t.id = s.table_id AND t.deleted_at IS NULL
                 JOIN event e ON e.id = s.event_id AND e.deleted_at IS NULL WHERE s.person_id = p.id) AS seats,
              (SELECT t.name FROM seat s JOIN seat_table t ON t.id = s.table_id AND t.deleted_at IS NULL
                 JOIN event e ON e.id = s.event_id AND e.deleted_at IS NULL WHERE s.person_id = p.id ORDER BY e.sort LIMIT 1) AS table_name
         FROM person p JOIN invitation i ON i.id = p.invitation_id
        WHERE i.wedding_id = ? AND p.deleted_at IS NULL ORDER BY p.invitation_id, p.idx`),
    q(`SELECT ie.invitation_id, e.key FROM invite_event ie JOIN event e ON e.id = ie.event_id WHERE e.wedding_id = ? AND e.deleted_at IS NULL ORDER BY e.sort`),
    q(`SELECT r.invitation_id, e.key, r.attending, r.count, r.answers, r.message, r.via, r.updated_at FROM rsvp r JOIN event e ON e.id = r.event_id WHERE e.wedding_id = ? AND e.deleted_at IS NULL`),
    q(`SELECT id, key, name, mode, enabled, audience FROM campaign WHERE wedding_id = ? AND deleted_at IS NULL ORDER BY sort`),
    q(`SELECT s.campaign_id, s.send_at, s.status, s.last_error FROM campaign_slot s JOIN campaign c ON c.id = s.campaign_id WHERE c.wedding_id = ? AND c.deleted_at IS NULL`),
    // Each guest's latest text only (not the whole history): one row per invitation.
    q(`SELECT x.invitation_id, COALESCE(c.name, CASE x.kind WHEN 'reply' THEN 'Reply to their text' ELSE 'Text' END) AS name, x.at, x.status
         FROM (SELECT o.invitation_id, o.campaign_id, o.kind, o.status, COALESCE(o.sent_at, o.created_at) AS at,
                      ROW_NUMBER() OVER (PARTITION BY o.invitation_id ORDER BY COALESCE(o.sent_at, o.created_at) DESC, o.rowid DESC) AS n
                 FROM sms_out o WHERE o.wedding_id = ? AND o.invitation_id IS NOT NULL AND o.status != 'cancelled') x
         LEFT JOIN campaign c ON c.id = x.campaign_id
        WHERE x.n = 1`),
    // Messages waiting for the couple: texted questions, unread messages from guests' pages and board posts to approve.
    q(`SELECT (SELECT COUNT(*) FROM sms_in WHERE wedding_id = ?1 AND action = 'Needs you' AND handled = 0) + (SELECT COUNT(*) FROM message WHERE wedding_id = ?1 AND from_guest = 1 AND read_at IS NULL) + (SELECT COUNT(*) FROM board_post WHERE wedding_id = ?1 AND status = 'pending') AS n`),
    q(`SELECT id, event_id, name FROM seat_table WHERE wedding_id = ? AND deleted_at IS NULL`),
  ]);
  const wr = w!.results[0] as Record<string, string | null> | undefined;
  if (!wr) return null;

  const guests = new Map<string, AdminGuest>();
  for (const r of inv!.results as { id: string; phone: string | null; seats_held: number; party: string; sms_optout: number; version: number; created_at: string; opened_at: string | null }[]) {
    guests.set(r.id, {
      id: r.id, phone: r.phone, phoneDisplay: r.phone ? displayPhone(r.phone) : '', seatsHeld: r.seats_held, party: r.party, optOut: !!r.sms_optout,
      version: r.version, createdAt: r.created_at, openedAt: r.opened_at, people: [], invited: [], rsvp: {}, repliedAt: null, lastSms: null,
    });
  }
  for (const p of ppl!.results as Record<string, string | number | null>[]) {
    guests.get(String(p.invitation_id))?.people.push({
      id: String(p.id), idx: Number(p.idx), name: String(p.name), diet: String(p.diet ?? ''), table: (p.table_name as string | null) ?? null,
      tables: json<Record<string, string>>(p.seats as string | null, {}),
      meals: json<AdminPerson['meals']>(p.meals as string | null, {}),
      meal: { entree: '', main: '', dessert: '' },
      role: String(p.party_role ?? ''),
    });
  }
  // `meal` (older screens): what they're given at the first event.
  const firstKey = (ev!.results[0] as { key?: string } | undefined)?.key ?? '';
  for (const g of guests.values())
    for (const p of g.people) {
      const c = p.meals[firstKey];
      if (c) p.meal = { entree: c.entree, main: c.main, dessert: c.dessert };
    }
  for (const x of ie!.results as { invitation_id: string; key: string }[]) guests.get(x.invitation_id)?.invited.push(x.key);
  for (const x of rs!.results as { invitation_id: string; key: string; attending: number | null; count: number; answers: string; message: string; via: string; updated_at: string }[]) {
    const g = guests.get(x.invitation_id);
    if (!g) continue;
    g.rsvp[x.key] = {
      attending: x.attending === null ? null : !!x.attending, count: x.count, answers: json(x.answers, {}), message: x.message, via: x.via, updatedAt: x.updated_at,
    };
    if (x.attending !== null && (!g.repliedAt || x.updated_at > g.repliedAt)) g.repliedAt = x.updated_at;
  }
  for (const m of last!.results as { invitation_id: string; name: string; at: string; status: string }[]) {
    const g = guests.get(m.invitation_id);
    if (g) g.lastSms = { name: m.name, at: m.at, status: m.status };
  }

  return {
    wedding: {
      id: String(wr.id), slug: String(wr.slug), name1: String(wr.name1), name2: String(wr.name2), monogram: String(wr.monogram ?? ''), theme: String(wr.theme ?? ''), timezone: String(wr.timezone),
      sender: wr.sms_sender ?? null, content: json(wr.content, {}), guide: json(wr.guide, {}),
    },
    events: (ev!.results as Record<string, string | number>[]).map((e) => ({
      id: String(e.id), key: String(e.key), name: String(e.name), pendingLabel: String(e.pending_label), startsAt: String(e.starts_at),
      sort: Number(e.sort), hasSeating: !!e.has_seating, catered: !!e.catered, venue: String(e.venue ?? ''), questions: json(String(e.questions), []),
    })),
    guests: [...guests.values()],
    campaigns: (cp!.results as Record<string, string | number>[]).map((c) => ({
      id: String(c.id), key: String(c.key), name: String(c.name), mode: String(c.mode), enabled: !!c.enabled, audience: String(c.audience),
    })),
    slots: (sl!.results as { campaign_id: string; send_at: string; status: string; last_error: string | null }[]).map((s) => ({
      campaignId: s.campaign_id, sendAt: s.send_at, status: s.status, lastError: s.last_error,
    })),
    inboxNeedsYou: Number((inbox!.results[0] as { n: number } | undefined)?.n ?? 0),
    tables: (tb!.results as { id: string; event_id: string; name: string }[]).map((t) => ({ id: t.id, eventId: t.event_id, name: t.name })),
  };
}
