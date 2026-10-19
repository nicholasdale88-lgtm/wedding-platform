# 04: API

Base path `/api`. JSON in and out, zod-validated. Error shape: `{ error: { code, message } }`.
- Admin routes need a session cookie plus a membership of the wedding.
- Writes need the `If-Match: <version>` header on PATCH. A mismatch returns 409.

## Public (guest), `/api/p/:slug/...`
| Method | Path | Body / query | Returns |
|---|---|---|---|
| GET | `/invite?g=` | | `{ wedding: {names, monogram, theme, content, musicUrl, heroUrl}, invitation: {token, people:[{idx,name,diet}], seatsHeld, events:[{key,name,startsAt,venue,questions}], rsvp: {eventKey:{attending,count,answers}}, message } }` |
| POST | `/find` | `{ name }` | the same `invitation` object or 404. Rate limited |
| POST | `/rsvp` | `{ token, events:{[key]:{attending:boolean,count?:number,answers?:{}}}, people:[{idx,diet}], message? }` | `{ ok }`. `count` is clamped to 1..seatsHeld. Unknown events are ignored. Writes `updated_at` |
| GET | `/guide?g=` | | `{ guide, people:[{name, table, meal:{entree,main,dessert}, diet}], tables:[{name, shape, dir, length, x, y, mine}], areas, planUrl, tablemates:{[tableName]: string[]}, parkVideoUrl, photoUploadUrl }`. Tablemate names only |
| POST | `/uploads` | `{ token?, kind:'photo', contentType, bytes }` | `{ key, putUrl, thumbKey, thumbPutUrl }`. Max 25 MB per photo, `image/*` only |
| POST | `/photos` | `{ token?, by, key, thumbKey }` | `{ ok }` |

## Admin, `/api/a/...`
**Session**: `POST /auth/login {email, passcode}`, `POST /auth/logout`, `GET /me` returns `{user, weddings:[{id,slug,names,role}]}`.

**Per wedding** (`/api/a/w/:wid/...`):
| Area | Endpoints |
|---|---|
| Wedding | `GET /` · `PATCH /` (content, guide, theme, settings) |
| Events | `GET/POST /events` · `PATCH/DELETE /events/:id` |
| Invitations | `GET /invitations?filter=&q=` · `POST /invitations` · `PATCH /invitations/:id` · `DELETE` (soft) · `POST /invitations/:id/restore` |
| People | `PATCH /people/:id` (name, diet, meals, table_id) |
| RSVP | `PUT /invitations/:id/rsvp/:eventKey` (admin override, `via='admin'`) |
| Import | `POST /import/preview` (multipart xlsx/csv) returns `{ new:[...], updated:[...], errors:[{row,msg}] }` · `POST /import/commit {previewId}` |
| Exports (xlsx, built server-side with SheetJS) | `GET /export/guests` · `GET /export/dietary?event=` · `GET /export/venue?event=` (Summary, Dietary by table with Entrée/Main/Dessert/Serious, All guests by table) |
| Seating | `GET /seating?event=` · `PUT /seating/plan` · `POST/PATCH/DELETE /seating/tables` · `POST/PATCH/DELETE /seating/areas` · `POST /seating/assign {personIds, tableId\|null}` · `POST /seating/auto` · `POST /seating/example` |
| Campaigns | `GET /campaigns` · `POST` · `PATCH /:id` · `DELETE` · `POST /:id/slots` · `DELETE /slots/:id` · `POST /:id/send-now {invitationIds?}` · `GET /:id/preview?invitation=` (rendered text, parts, cost) |
| Inbox | `GET /inbox` · `PATCH /inbox/:id {handled}` · `POST /inbox/:id/reply {body}` |
| SMS log | `GET /sms?invitation=` |
| Media | `POST /uploads` (video up to 200 MB, music, hero, plan) · `GET /photos` · `DELETE /photos/:id` · `GET /photos/zip` (streams a zip from R2) |
| Backup | `GET /backup` (full JSON) · `POST /restore` (validates, then replaces in one transaction, after a confirm token) |
| Overview | `GET /overview` returns `{counts, needsYou:[{kind,title,detail,cta,link}], nextSends, latestReplies}`. "Needs you" is computed server-side so it's always right |

## Webhooks, `/api/hooks/...`
- `POST /mm/inbound?k=<MM_HOOK_SECRET>`: Mobile Message inbound SMS. Respond 200 within 5 s. Insert into `sms_in` (UNIQUE `provider_id`), then process (docs/05). Must be idempotent.
- `POST /mm/status?k=…`: delivery receipts. Update `sms_out.status` by `provider_id`.
- `POST /stripe` (M5): verify the signature, then credit the wallet or change the plan.

## Super-admin, `/api/super/...` (emails in SUPER_ADMINS)
`GET /weddings` · `POST /weddings` (create tenant + owner invite) · `PATCH /weddings/:id {plan, wallet_credits}` · `GET /usage` (sms counts, storage bytes per tenant).
