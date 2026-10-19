/**
 * Sophie & Nicholas RSVP backend (Google Apps Script, free).
 * Stores guests, RSVPs and scheduled texts in this Google Sheet, sends SMS via Mobile Message.
 * Script properties: ADMIN_KEY, MM_USER, MM_PASS, SENDER (dedicated number), ADMIN_MOBILE
 * Mobile Message inbound webhook: <web app URL>?hook=<ADMIN_KEY>
 * Run setup() once, then Deploy > Web app (Execute as me, Anyone).
 */
const TZ = 'Australia/Sydney';
const prop_ = k => PropertiesService.getScriptProperties().getProperty(k) || '';

function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runScheduled').timeBased().everyMinutes(15).create();
  sheet_('Data'); sheet_('Guests');
}

function doGet(e) { return route_(e.parameter || {}); }
function doPost(e) {
  let b = {}; try { b = JSON.parse(e.postData.contents); } catch (x) { b = e.parameter || {}; }
  const q = e.parameter || {};
  if (q.hook) { if (q.hook !== prop_('ADMIN_KEY')) return out_({ ok: false }); try { inbound_(b); } catch (err) {} return out_({ ok: true }); }
  return route_(b);
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function route_(p) {
  try {
    const a = p.action;
    if (a === 'guest') { const g = (load_().guests || []).find(x => x.token === p.g); return out_({ ok: !!g, guest: g ? pub_(g) : null }); }
    if (a === 'find') { const q = norm_(p.name); const g = (load_().guests || []).find(x => [x.name].concat(x.partners || []).some(n => norm_(n) === q)); return out_({ ok: !!g, guest: g ? pub_(g) : null }); }
    if (a === 'rsvp') return out_(rsvp_(p));
    if (a === 'photo') return out_(photo_(p));
    if (a === 'content') return out_({ ok: true, content: load_().content || {} });
    if (a === 'guide') { const d = load_(); const g = (d.guests || []).find(x => x.token === p.g); return out_({ ok: !!g, guest: g ? Object.assign(pub_(g), { table: g.table || '', rsvp: { diet: (g.rsvp || {}).diet || '' } }) : null, guide: d.guide || null, seating: d.seating || null, mates: mates_(d, g), meals: meals_(d, g) }); }
    if (!p.key || p.key !== prop_('ADMIN_KEY')) return out_({ ok: false, error: 'Wrong passcode for the backend' });
    if (a === 'load') return out_({ ok: true, data: load_() });
    if (a === 'photos') return out_(photos_());
    if (a === 'video') return out_(video_(p));
    if (a === 'save') { withLock_(() => save_(merge_(load_(), p.data || {}))); return out_({ ok: true }); }
    if (a === 'send') return out_(withLock_(() => send_(p.campaign, p.only)));
    if (a === 'test') return out_(sms_([{ to: phone_(p.to), message: 'Test from your RSVP admin. SMS is working.' }]));
    return out_({ ok: false, error: 'Unknown action' });
  } catch (err) { return out_({ ok: false, error: String(err) }); }
}

// Keep newer guest replies, texts and sends that happened on the server since the admin last loaded.
function merge_(cur, inc) {
  const byId = {}; (cur.guests || []).forEach(g => { byId[g.id] = g; });
  (inc.guests || []).forEach(g => {
    const o = byId[g.id]; if (!o) return;
    if (o.rsvp && o.rsvp.at && (!g.rsvp || !g.rsvp.at || o.rsvp.at > g.rsvp.at)) g.rsvp = o.rsvp;
    if ((o.sms || []).length > (g.sms || []).length) g.sms = o.sms;
  });
  const cById = {}; (cur.campaigns || []).forEach(c => { cById[c.key] = c; });
  (inc.campaigns || []).forEach(c => { const o = cById[c.key]; if (o && (o.sentAt || '') > (c.sentAt || '')) { c.status = o.status; c.sentAt = o.sentAt; } if (o && o.done) c.done = Array.from(new Set((c.done || []).concat(o.done))); });
  if ((cur.log || []).length > (inc.log || []).length) inc.log = cur.log;
  inc.inbox = cur.inbox || inc.inbox || [];
  (inc.guests || []).forEach(g => { const o = byId[g.id]; if (o && o.optout) g.optout = true; });
  return inc;
}

function rsvp_(p) {
  return withLock_(() => {
    const d = load_(); const g = (d.guests || []).find(x => x.token === p.token);
    if (!g) return { ok: false, error: 'Invitation not found' };
    const r = g.rsvp || {};
    g.rsvp = { w: g.W ? p.w === true : null, b: g.B ? p.b === true : null, n: Math.max(1, Math.min(g.max, parseInt(p.n, 10) || 1)), ride: p.ride || r.ride || 'Not sure yet', diet: String(p.diet || ''), msg: String(p.msg || ''), at: now_(), via: 'Invitation' };
    save_(d); return { ok: true };
  });
}

function send_(key, only) {
  const d = load_(); const c = (d.campaigns || []).find(x => x.key === key);
  if (!c) return { ok: false, error: 'Message not found' };
  const list = (d.guests || []).filter(g => g.phone && !g.optout && (only ? only.indexOf(g.id) > -1 : qualifies_(key, g, d) && (c.excl || []).indexOf(g.id) < 0));
  if (!list.length) { if (!only && c.status === 'Scheduled') { c.status = 'Draft'; save_(d); } return { ok: false, error: 'No one to send to' }; }
  const res = sms_(list.map(g => ({ to: phone_(g.phone), message: fill_(c.text, g) })));
  if (!res.ok) return res;
  const at = now_();
  list.forEach(g => { g.sms = (g.sms || []).concat([{ type: key, at, status: 'Sent' }]); });
  if (!only) { c.status = 'Sent'; c.sentAt = at; }
  d.log = [{ id: Date.now(), at, name: c.name + (only ? ' to ' + list[0].name : ''), count: list.length, sample: fill_(c.text, list[0]) }].concat(d.log || []);
  save_(d); return { ok: true, count: list.length, data: d };
}

function sms_(messages) {
  const sender = prop_('SENDER');
  const auth = 'Basic ' + Utilities.base64Encode(prop_('MM_USER') + ':' + prop_('MM_PASS'));
  for (let i = 0; i < messages.length; i += 500) {
    const batch = messages.slice(i, i + 500).map(m => ({ to: m.to, message: m.message, sender }));
    const r = UrlFetchApp.fetch('https://api.mobilemessage.com.au/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: auth, 'Idempotency-Key': Utilities.getUuid() },
      payload: JSON.stringify({ messages: batch })
    });
    const code = r.getResponseCode();
    if (code < 200 || code >= 300) return { ok: false, error: 'Mobile Message error ' + code + ': ' + r.getContentText().slice(0, 300) };
  }
  return { ok: true, count: messages.length };
}

// Autopilot: runs every 15 minutes.
function runScheduled() {
  withLock_(() => {
    const d = load_(); const n = now_(); const hr = parseInt(Utilities.formatDate(new Date(), TZ, 'H'), 10); let changed = false;
    (d.campaigns || []).forEach(c => {
      if (!c.on) return;
      const elig = g => g.phone && !g.optout && (c.excl || []).indexOf(g.id) < 0;
      let list = [], mark = {};
      if (c.mode === 'auto') {
        if (hr < 8 || hr >= 20) return;
        list = (d.guests || []).filter(g => elig(g) && autoDue_(c, g));
      } else if (c.mode === 'dates') {
        const due = (c.dates || []).filter(x => x <= n && (c.done || []).indexOf(x) < 0);
        if (!due.length) return;
        c.done = (c.done || []).concat(due); changed = true;
        list = (d.guests || []).filter(g => elig(g) && qualifies_(c.key, g, d));
      }
      if (!list.length) return;
      const res = sms_(list.map(g => ({ to: phone_(g.phone), message: fill_(c.text, g) })));
      if (!res.ok) { if (c.mode === 'dates') c.done = c.done.slice(0, -1); return; }
      const at = now_();
      list.forEach(g => { g.sms = (g.sms || []).concat([{ type: c.key, at, status: 'Sent' }]); });
      c.sentAt = at; changed = true;
      d.log = [{ id: Date.now(), at, name: c.name + ' (autopilot)', count: list.length, sample: fill_(c.text, list[0]) }].concat(d.log || []);
    });
    if (changed) save_(d);
  });
}
function autoDue_(c, g) {
  const r = g.rsvp || {};
  if (c.key === 'invite') return !(g.sms || []).some(x => x.type === 'invite');
  if (c.key === 'thanks') return !!r.at && !(g.sms || []).some(x => x.type === 'thanks' && x.at >= r.at);
  return false;
}

function qualifies_(key, g, d) {
  const r = g.rsvp || {};
  const cc = d && (d.campaigns || []).find(x => x.key === key);
  if (cc && cc.audKey) { const k = cc.audKey; return k === 'all' || (k === 'W' && g.W) || (k === 'B' && g.B) || (k === 'wYes' && g.W && r.w === true) || (k === 'bYes' && g.B && r.b === true) || (k === 'awaiting' && ((g.W && r.w == null) || (g.B && r.b == null))) || (k === 'declined' && (!g.W || r.w === false) && (!g.B || r.b === false)); } const invited = (g.sms || []).some(x => x.type === 'invite');
  const awaiting = (g.W && r.w == null) || (g.B && r.b == null);
  if (key === 'invite') return !invited;
  if (key === 'reminder') return invited && awaiting;
  if (key === 'ride') return g.B && r.b === true && r.ride !== 'No, not riding';
  if (key === 'nightW' || key === 'rain') return g.W && r.w === true;
  if (key === 'nightB') return g.B && r.b === true;
  if (key === 'thanks') return !!r.at;
  if (key === 'photos') return g.W && r.w === true;
  return false;
}
function firsts_(g) { const ns = [g.name].concat(g.partners || []).map(x => String(x).trim().split(' ')[0]).filter(String); return ns.length > 1 ? ns.slice(0, -1).join(', ') + ' and ' + ns[ns.length - 1] : ns[0] || 'there'; }
function fill_(t, g) { const site = String((cache_.d && cache_.d.siteUrl) || '').replace(/\/+$/, ''); return t.replace(/\{first\}/g, firsts_(g)).replace(/\{link\}/g, (site ? site + '/?g=' : prop_('INVITE_URL')) + g.token).replace(/\{pending\}/g, pending_(g)).replace(/\{guide\}/g, (site ? site + '/tomorrow/?g=' : prop_('GUIDE_URL')) + g.token).replace(/\{photos\}/g, (site ? site + '/photos/?g=' : prop_('PHOTO_URL')) + g.token); }
function pending_(g) { const r = g.rsvp || {}; const e = [g.W && r.w == null ? 'the wedding' : '', g.B && r.b == null ? "Nicholas's 30th" : ''].filter(String); return e.length ? e.join(' and ') : 'the celebrations'; }
function pub_(g) { return { token: g.token, name: g.name, partners: (g.partners || []).filter(String), max: g.max, W: g.W, B: g.B }; }
function norm_(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, ' '); }
function phone_(v) { let d = String(v || '').replace(/\D/g, ''); if (d.indexOf('61') === 0) d = '0' + d.slice(2); if (d.length === 9 && d[0] === '4') d = '0' + d; return d; }
function now_() { return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm"); }
function withLock_(f) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return f(); } finally { l.releaseLock(); } }

function sheet_(n) { const ss = SpreadsheetApp.getActive(); return ss.getSheetByName(n) || ss.insertSheet(n); }
const cache_ = {};
function load_() { const v = sheet_('Data').getRange('A1:A200').getValues().map(r => r[0]).join(''); cache_.d = v ? JSON.parse(v) : {}; return cache_.d; }
function save_(d) {
  const s = JSON.stringify(d), sh = sheet_('Data'), parts = [];
  for (let i = 0; i < s.length; i += 40000) parts.push([s.slice(i, i + 40000)]);
  sh.getRange('A1:A200').clearContent();
  if (parts.length) sh.getRange(1, 1, parts.length, 1).setValues(parts);
  const yn = (inv, v) => !inv ? 'Not invited' : v === true ? 'Yes' : v === false ? 'No' : 'Awaiting';
  const rows = [['Main contact', 'Also on invitation', 'Mobile', 'Wedding', '30th', 'Seats held', 'Attending', 'Riding', 'Dietary', 'Message', 'Replied']];
  (d.guests || []).forEach(g => { const r = g.rsvp || {}; rows.push([g.name, (g.partners || []).filter(String).join(', '), g.phone, yn(g.W, r.w), yn(g.B, r.b), g.max, (g.W && r.w) || (g.B && r.b) ? r.n : '', g.B && r.b ? r.ride : '', r.diet || '', r.msg || '', r.at || '']); });
  const gs = sheet_('Guests'); gs.clearContents(); gs.getRange(1, 1, rows.length, rows[0].length).setValues(rows); gs.setFrozenRows(1);
}

// ---- Two-way SMS: Mobile Message posts guest replies here (webhook URL ends in ?hook=ADMIN_KEY)
function inbound_(b) {
  const from = phone_(b.sender || b.from || b.number || b.source_number || '');
  const text = String(b.message || b.text || b.body || '').trim();
  if (!from || !text) return;
  withLock_(() => {
    const d = load_(); const at = now_();
    const id = String(b.message_id || b.id || (from + '|' + text + '|' + (b.received_at || at)));
    d.inbox = d.inbox || [];
    if (d.inbox.some(m => m.mid === id)) return; // webhooks can retry
    const g = (d.guests || []).find(x => phone_(x.phone) === from);
    let action = 'Needs you', reply = '';
    if (!g) action = 'Unknown number';
    else if (/^(stop|unsubscribe|opt ?out)\b/i.test(text)) { g.optout = true; action = 'Opted out of texts'; }
    else {
      const yes = /^(yes|y|yep|yeah|yes please|coming|attending|accept|definitely|absolutely|of course)\b/i.test(text);
      const no = /^(no|n|nope|sorry|can'?t|cannot|unable|decline|regretfully)\b/i.test(text);
      if ((yes || no) && g.W !== g.B) {
        const k = g.W ? 'w' : 'b'; const r = g.rsvp || {};
        g.rsvp = Object.assign({}, r, { [k]: yes, n: yes ? Math.max(1, g.max || 1) : (r.n || 1), at, via: 'Text reply' });
        action = 'RSVP set to ' + (yes ? 'yes' : 'no');
        reply = yes ? "Wonderful, {first}! You're down as coming to " + (g.W ? 'the wedding' : "Nicholas's 30th") + ". Add numbers and dietary needs here: {link}" : "Thanks for letting us know, {first}. We'll miss you! If plans change: {link}";
      } else if (yes || no) { action = 'Sent their link to reply for each event'; reply = "Thanks {first}! You're invited to both celebrations, so please reply for each one here: {link}"; }
    }
    if (reply && g) { const res = sms_([{ to: from, message: fill_(reply, g) }]); if (res.ok) g.sms = (g.sms || []).concat([{ type: /^RSVP/.test(action) ? 'thanks' : 'reply', at, status: 'Sent' }]); }
    if (action === 'Needs you' || action === 'Unknown number') { const am = prop_('ADMIN_MOBILE'); if (am) sms_([{ to: phone_(am), message: 'Reply from ' + (g ? g.name : from) + ': ' + text.slice(0, 280) }]); }
    d.inbox.unshift({ mid: id, id: Date.now(), at, gid: g ? g.id : '', name: g ? g.name : from, text: text.slice(0, 500), action });
    d.inbox = d.inbox.slice(0, 500);
    save_(d);
  });
}

// ---- Photo album: guest uploads go to a Google Drive folder
function folder_() {
  const id = prop_('PHOTO_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('Sophie & Nicholas - Guest photos');
  PropertiesService.getScriptProperties().setProperty('PHOTO_FOLDER', f.getId());
  return f;
}
function photo_(p) {
  if (!p.data) return { ok: false, error: 'No photo' };
  const d = load_(); const g = (d.guests || []).find(x => x.token === p.token);
  const by = (g ? g.name : String(p.by || 'Guest')).slice(0, 60);
  const bytes = Utilities.base64Decode(String(p.data).replace(/^data:[^,]+,/, ''));
  if (bytes.length > 20e6) return { ok: false, error: 'Photo too large' };
  const mime = /^image\/(jpeg|png|webp|heic|heif)$/.test(p.mime) ? p.mime : 'image/jpeg';
  const name = by.replace(/[^\w '-]/g, '') + ' ' + now_().replace(/[:T]/g, '-') + ' ' + Math.random().toString(36).slice(2, 6) + '.jpg';
  const f = folder_().createFile(Utilities.newBlob(bytes, mime, name));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  withLock_(() => sheet_('Photos').appendRow([f.getId(), by, p.token || '', now_(), name]));
  return { ok: true };
}
function photos_() {
  const sh = sheet_('Photos'); const n = sh.getLastRow();
  const rows = n ? sh.getRange(1, 1, n, 5).getValues() : [];
  return { ok: true, folderUrl: folder_().getUrl(), photos: rows.filter(r => r[0]).map(r => ({ id: r[0], by: r[1], at: String(r[3]).replace('T', ' '), thumb: 'https://drive.google.com/thumbnail?id=' + r[0] + '&sz=w600', url: 'https://drive.google.com/file/d/' + r[0] + '/view' })) };
}

function mates_(d, g) {
  if (!g) return {};
  const seats = (d.seating || {}).seats || {}; const mine = {}; Object.keys(seats).forEach(k => { if (k.split(':')[0] === g.id) mine[seats[k]] = 1; });
  const byId = {}; (d.guests || []).forEach(x => { byId[x.id] = x; }); const out = {};
  Object.keys(seats).forEach(k => { const t = seats[k]; if (!mine[t]) return; const parts = k.split(':'); if (parts[0] === g.id) return; const x = byId[parts[0]]; if (!x) return; const nm = [x.name].concat(x.partners || [])[+parts[1]]; if (nm) (out[t] = out[t] || []).push(nm); });
  return out;
}

function meals_(d, g) { const o = {}; if (!g) return o; Object.keys(d.meals || {}).forEach(k => { if (k.split(':')[0] === g.id) o[k] = d.meals[k]; }); return o; }
function video_(p) {
  if (!p.data) return { ok: false, error: 'No video' };
  const bytes = Utilities.base64Decode(String(p.data).replace(/^data:[^,]+,/, ''));
  const f = folder_().createFile(Utilities.newBlob(bytes, p.mime || 'video/mp4', 'Parking video - ' + (p.name || 'video.mp4')));
  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return { ok: true, url: 'https://drive.google.com/file/d/' + f.getId() + '/preview' };
}
