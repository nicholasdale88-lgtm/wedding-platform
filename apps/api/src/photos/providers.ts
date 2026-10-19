import type { Env } from '../env';

/**
 * The couple's own photo storage: Google Drive, Google Photos, Dropbox and OneDrive. Each is linked
 * once with the provider's own sign-in (OAuth); we keep only a sealed refresh token and ask for the
 * narrowest access each offers:
 *  - Google Drive: drive.file (only files this site creates; nothing else in their Drive)
 *  - Google Photos: appendonly + readonly.appcreateddata (add to albums we make; read back only those)
 *  - Dropbox: an "App folder" app (Apps/<app name>/ only)
 *  - OneDrive: Files.ReadWrite.AppFolder (Apps/<app name>/ only)
 * Photos go in one folder (or album) per event. Uploads go straight from the Worker to the provider.
 */

export type ProviderKey = 'gdrive' | 'gphotos' | 'dropbox' | 'onedrive';
export const PROVIDERS: ProviderKey[] = ['gdrive', 'gphotos', 'dropbox', 'onedrive'];
export const PROVIDER_NAME: Record<ProviderKey, string> = { gdrive: 'Google Drive', gphotos: 'Google Photos', dropbox: 'Dropbox', onedrive: 'OneDrive' };

export interface Tokens {
  access: string;
  refresh?: string;
  /** Seconds the access token lasts (about an hour for all four). */
  expires?: number;
}
export interface Upload {
  bytes: Uint8Array;
  name: string;
  type: string;
  /** The folder or album for this photo's event (made on first use; see folderFor). */
  folder: string;
}
export interface Provider {
  /** Where to send the couple to link their account. */
  authUrl(env: Env, redirect: string, state: string): string;
  /** The code from the provider's redirect, for tokens and who they signed in as. */
  exchange(env: Env, redirect: string, code: string): Promise<Tokens & { account: string }>;
  refresh(env: Env, refresh: string): Promise<Tokens>;
  /** Makes (or finds) the folder or album called `name`; returns its id. */
  folder(token: string, name: string, root: string): Promise<string>;
  upload(token: string, u: Upload): Promise<string>;
  /** The file (or the part asked for with a Range header, for videos). */
  download(token: string, id: string, range?: string): Promise<Response>;
}

export class ProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The link itself is broken (access revoked): the couple has to connect again. */
    readonly relink = false,
  ) {
    super(message);
  }
}

async function ok(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const text = (await res.text().catch(() => '')).slice(0, 300);
  const relink = res.status === 401 || /invalid_grant|expired_access_token|invalid_access_token/.test(text);
  throw new ProviderError(res.status, `${what} failed (${res.status})${text ? `: ${text}` : ''}`, relink);
}
const json = async <T>(res: Response, what: string) => (await (await ok(res, what)).json()) as T;
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
const bearer = (t: string, more: Record<string, string> = {}) => ({ authorization: `Bearer ${t}`, ...more });

/** A JWT's payload (Google's id_token: who signed in). Not verified: it came straight from Google over TLS. */
const jwtEmail = (jwt: string | undefined) => {
  try {
    const p = jwt?.split('.')[1];
    return p ? ((JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))) as { email?: string }).email ?? '') : '';
  } catch {
    return '';
  }
};

/** Safe as a file or folder name on every provider. */
export const safeName = (s: string) =>
  s
    // eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
    .replace(/[\\/:*?"<>|#%\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Photos';

// ---------------------------------------------------------------- Google (Drive and Photos)

const google = (scopes: string): Pick<Provider, 'authUrl' | 'exchange' | 'refresh'> => ({
  authUrl: (env, redirect, state) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${form({
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirect,
      response_type: 'code',
      scope: `openid email ${scopes}`,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'false',
      state,
    })}`,
  exchange: async (env, redirect, code) => {
    const r = await json<{ access_token: string; refresh_token?: string; id_token?: string }>(
      await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: FORM,
        body: form({ code, client_id: env.GOOGLE_CLIENT_ID ?? '', client_secret: env.GOOGLE_CLIENT_SECRET ?? '', redirect_uri: redirect, grant_type: 'authorization_code' }),
      }),
      'Google sign-in',
    );
    return { access: r.access_token, refresh: r.refresh_token, account: jwtEmail(r.id_token) };
  },
  refresh: async (env, refresh) => {
    const r = await json<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: FORM,
        body: form({ refresh_token: refresh, client_id: env.GOOGLE_CLIENT_ID ?? '', client_secret: env.GOOGLE_CLIENT_SECRET ?? '', grant_type: 'refresh_token' }),
      }),
      'Google access',
    );
    return { access: r.access_token, refresh: r.refresh_token, expires: r.expires_in };
  },
});

/** multipart/related body: JSON metadata, then the file. */
function multipart(meta: unknown, bytes: Uint8Array, type: string) {
  const boundary = `wp${crypto.randomUUID().replace(/-/g, '')}`;
  const te = new TextEncoder();
  const head = te.encode(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\ncontent-type: ${type}\r\n\r\n`);
  const tail = te.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return { body, type: `multipart/related; boundary=${boundary}` };
}

const DRIVE = 'https://www.googleapis.com/drive/v3';
const gdrive: Provider = {
  ...google('https://www.googleapis.com/auth/drive.file'),
  async folder(token, name, root) {
    // `root` is the top folder's id ('' while it doesn't exist yet: then `name` is the top folder).
    const parent = root || 'root';
    const q = `name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${parent}' in parents and trashed = false`;
    const found = await json<{ files: { id: string }[] }>(await fetch(`${DRIVE}/files?${form({ q, fields: 'files(id)', pageSize: '1' })}`, { headers: bearer(token) }), 'Finding the folder');
    if (found.files[0]) return found.files[0].id;
    const made = await json<{ id: string }>(
      await fetch(`${DRIVE}/files?fields=id`, {
        method: 'POST',
        headers: bearer(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
      }),
      'Making the folder',
    );
    return made.id;
  },
  async upload(token, u) {
    if (u.bytes.length > 4_500_000) {
      // Over 5 MB (a video): Drive wants a resumable upload, started with the details, then the bytes.
      const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id', {
        method: 'POST',
        headers: bearer(token, { 'content-type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': u.type, 'X-Upload-Content-Length': String(u.bytes.length) }),
        body: JSON.stringify({ name: u.name, parents: [u.folder] }),
      });
      const at = start.ok ? start.headers.get('location') : null;
      if (!at) await json(start, 'Starting the Google Drive upload');
      const r = await json<{ id: string }>(await fetch(at!, { method: 'PUT', headers: { 'content-type': u.type }, body: u.bytes }), 'Saving to Google Drive');
      return r.id;
    }
    const m = multipart({ name: u.name, parents: [u.folder] }, u.bytes, u.type);
    const r = await json<{ id: string }>(
      await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: bearer(token, { 'content-type': m.type }), body: m.body }),
      'Saving to Google Drive',
    );
    return r.id;
  },
  download: async (token, id, range) => ok(await fetch(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, { headers: bearer(token, range ? { range } : {}) }), 'Opening the photo'),
};

const PHOTOS = 'https://photoslibrary.googleapis.com/v1';
const gphotos: Provider = {
  ...google('https://www.googleapis.com/auth/photoslibrary.appendonly https://www.googleapis.com/auth/photoslibrary.readonly.appcreateddata'),
  // Albums are flat: the album is "<top> · <event>".
  async folder(token, name, root) {
    const title = root ? `${root} · ${name}` : name;
    const r = await json<{ id: string }>(
      await fetch(`${PHOTOS}/albums`, { method: 'POST', headers: bearer(token, { 'content-type': 'application/json' }), body: JSON.stringify({ album: { title: title.slice(0, 500) } }) }),
      'Making the album',
    );
    return r.id;
  },
  async upload(token, u) {
    const up = await ok(
      await fetch(`${PHOTOS}/uploads`, {
        method: 'POST',
        headers: bearer(token, { 'content-type': 'application/octet-stream', 'X-Goog-Upload-Content-Type': u.type, 'X-Goog-Upload-Protocol': 'raw' }),
        body: u.bytes,
      }),
      'Sending to Google Photos',
    );
    const uploadToken = await up.text();
    const r = await json<{ newMediaItemResults?: { status?: { message?: string; code?: number }; mediaItem?: { id: string } }[] }>(
      await fetch(`${PHOTOS}/mediaItems:batchCreate`, {
        method: 'POST',
        headers: bearer(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ albumId: u.folder, newMediaItems: [{ simpleMediaItem: { uploadToken, fileName: u.name } }] }),
      }),
      'Adding to the album',
    );
    const item = r.newMediaItemResults?.[0];
    if (!item?.mediaItem?.id) throw new ProviderError(502, `Google Photos did not take it: ${item?.status?.message ?? 'no reason given'}`);
    return item.mediaItem.id;
  },
  async download(token, id, range) {
    const item = await json<{ baseUrl: string; mimeType?: string }>(await fetch(`${PHOTOS}/mediaItems/${encodeURIComponent(id)}`, { headers: bearer(token) }), 'Opening the photo');
    // Photos download with "=d"; videos with "=dv".
    return ok(await fetch(`${item.baseUrl}=${(item.mimeType ?? '').startsWith('video/') ? 'dv' : 'd'}`, range ? { headers: { range } } : undefined), 'Opening the photo');
  },
};

// ---------------------------------------------------------------- Dropbox

/** Dropbox-API-Arg must be ASCII: everything else as \u escapes. */
const dbxArg = (o: unknown) => JSON.stringify(o).replace(/[\u007f-\uffff]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dropbox: Provider = {
  authUrl: (env, redirect, state) =>
    `https://www.dropbox.com/oauth2/authorize?${form({ client_id: env.DROPBOX_APP_KEY ?? '', redirect_uri: redirect, response_type: 'code', token_access_type: 'offline', state })}`,
  async exchange(env, redirect, code) {
    const r = await json<{ access_token: string; refresh_token?: string }>(
      await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: FORM,
        body: form({ code, grant_type: 'authorization_code', redirect_uri: redirect, client_id: env.DROPBOX_APP_KEY ?? '', client_secret: env.DROPBOX_APP_SECRET ?? '' }),
      }),
      'Dropbox sign-in',
    );
    const me = await json<{ email?: string }>(await fetch('https://api.dropboxapi.com/2/users/get_current_account', { method: 'POST', headers: bearer(r.access_token) }), 'Dropbox account');
    return { access: r.access_token, refresh: r.refresh_token, account: me.email ?? '' };
  },
  async refresh(env, refresh) {
    const r = await json<{ access_token: string; expires_in?: number }>(
      await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: FORM,
        body: form({ refresh_token: refresh, grant_type: 'refresh_token', client_id: env.DROPBOX_APP_KEY ?? '', client_secret: env.DROPBOX_APP_SECRET ?? '' }),
      }),
      'Dropbox access',
    );
    return { access: r.access_token, expires: r.expires_in };
  },
  // The app folder is the top; each event is a folder in it (made by the first upload).
  folder: async (_token, name) => `/${safeName(name)}`,
  async upload(token, u) {
    const r = await json<{ id: string }>(
      await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: bearer(token, { 'content-type': 'application/octet-stream', 'Dropbox-API-Arg': dbxArg({ path: `${u.folder}/${u.name}`, mode: 'add', autorename: true, mute: true }) }),
        body: u.bytes,
      }),
      'Saving to Dropbox',
    );
    return r.id;
  },
  download: async (token, id, range) =>
    ok(await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: bearer(token, { 'Dropbox-API-Arg': dbxArg({ path: id }), ...(range ? { range } : {}) }) }), 'Opening the photo'),
};

// ---------------------------------------------------------------- OneDrive (Microsoft Graph)

const MS_SCOPE = 'offline_access User.Read Files.ReadWrite.AppFolder';
const MS_TOKEN = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const onedrive: Provider = {
  authUrl: (env, redirect, state) =>
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${form({ client_id: env.MS_CLIENT_ID ?? '', redirect_uri: redirect, response_type: 'code', response_mode: 'query', scope: MS_SCOPE, state })}`,
  async exchange(env, redirect, code) {
    const r = await json<{ access_token: string; refresh_token?: string }>(
      await fetch(MS_TOKEN, { method: 'POST', headers: FORM, body: form({ code, client_id: env.MS_CLIENT_ID ?? '', client_secret: env.MS_CLIENT_SECRET ?? '', redirect_uri: redirect, grant_type: 'authorization_code', scope: MS_SCOPE }) }),
      'Microsoft sign-in',
    );
    const me = await json<{ mail?: string; userPrincipalName?: string }>(await fetch(`${GRAPH}/me`, { headers: bearer(r.access_token) }), 'Microsoft account');
    return { access: r.access_token, refresh: r.refresh_token, account: me.mail || me.userPrincipalName || '' };
  },
  async refresh(env, refresh) {
    const r = await json<{ access_token: string; refresh_token?: string; expires_in?: number }>(
      await fetch(MS_TOKEN, { method: 'POST', headers: FORM, body: form({ refresh_token: refresh, client_id: env.MS_CLIENT_ID ?? '', client_secret: env.MS_CLIENT_SECRET ?? '', grant_type: 'refresh_token', scope: MS_SCOPE }) }),
      'Microsoft access',
    );
    return { access: r.access_token, refresh: r.refresh_token, expires: r.expires_in };
  },
  folder: async (_token, name) => safeName(name),
  async upload(token, u) {
    // An upload session takes any size up to the photo limit in one go.
    const path = `${encodeURIComponent(u.folder)}/${encodeURIComponent(u.name)}`;
    const s = await json<{ uploadUrl: string }>(
      await fetch(`${GRAPH}/me/drive/special/approot:/${path}:/createUploadSession`, {
        method: 'POST',
        headers: bearer(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
      }),
      'Starting the OneDrive upload',
    );
    const r = await json<{ id: string }>(
      await fetch(s.uploadUrl, { method: 'PUT', headers: { 'content-range': `bytes 0-${u.bytes.length - 1}/${u.bytes.length}` }, body: u.bytes }),
      'Saving to OneDrive',
    );
    return r.id;
  },
  download: async (token, id, range) => ok(await fetch(`${GRAPH}/me/drive/items/${encodeURIComponent(id)}/content`, { headers: bearer(token, range ? { range } : {}) }), 'Opening the photo'),
};

export const PROVIDER: Record<ProviderKey, Provider> = { gdrive, gphotos, dropbox, onedrive };

/** Whether the site has this provider's app keys (set once, in the deploy secrets). */
export const providerReady = (env: Env, p: ProviderKey) =>
  p === 'dropbox' ? !!(env.DROPBOX_APP_KEY && env.DROPBOX_APP_SECRET) : p === 'onedrive' ? !!(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET) : !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
