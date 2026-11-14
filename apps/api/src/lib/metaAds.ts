import { AD_IMAGES, adLink, type AdsSettings, type AdVariant } from '@wp/shared';
import type { Env } from '../env';

/**
 * Meta's Marketing API (Facebook and Instagram ads) for the Ads bot. Everything is created PAUSED first and
 * switched on only when a person approves (routes/ads.ts). The token is a system user's, pasted in Connections;
 * it's sent in the Authorization header, never in a URL.
 * Graph API versions last about two years: bump META_VERSION before this one is retired.
 */
export const META_VERSION = 'v24.0';
const GRAPH = `https://graph.facebook.com/${META_VERSION}`;

export class MetaError extends Error {}

export type MetaConfig = { token: string; account: string; page: string; ig: string };

/** The connection, or what's missing. */
export function metaConfig(env: Env): MetaConfig | { missing: string[] } {
  const token = (env.META_ADS_TOKEN ?? '').trim();
  const raw = (env.META_AD_ACCOUNT_ID ?? '').trim().replace(/^act_/, '');
  const page = (env.META_PAGE_ID ?? '').trim();
  const missing = [!token && 'META_ADS_TOKEN', !/^\d{5,25}$/.test(raw) && 'META_AD_ACCOUNT_ID', !/^\d{5,25}$/.test(page) && 'META_PAGE_ID'].filter(Boolean) as string[];
  if (missing.length) return { missing };
  return { token, account: `act_${raw}`, page, ig: (env.META_IG_USER_ID ?? '').trim().replace(/\D/g, '') };
}

async function call<T>(cfg: MetaConfig, method: 'GET' | 'POST', path: string, params: Record<string, string | number | object> = {}): Promise<T> {
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]));
  const url = method === 'GET' ? `${GRAPH}${path}?${new URLSearchParams(flat).toString()}` : `${GRAPH}${path}`;
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${cfg.token}`, ...(method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    ...(method === 'POST' ? { body: new URLSearchParams(flat).toString() } : {}),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; error_user_msg?: string } };
  if (!res.ok || data.error) {
    const m = data.error?.error_user_msg || data.error?.message || `Meta said ${res.status}`;
    throw new MetaError(m.slice(0, 240));
  }
  return data;
}

/** Interest ids for the audience, found by name (Meta's ids change, so they're looked up, not kept here). */
async function interests(cfg: MetaConfig): Promise<{ id: string; name: string }[]> {
  const out: { id: string; name: string }[] = [];
  for (const q of ['Weddings', 'Wedding planning', 'Engagement ring', 'Wedding dress']) {
    try {
      const r = await call<{ data?: { id: string; name: string }[] }>(cfg, 'GET', '/search', { type: 'adinterest', q, limit: 1 });
      const hit = r.data?.[0];
      if (hit && !out.some((o) => o.id === hit.id)) out.push({ id: hit.id, name: hit.name });
    } catch {
      // Interests are a suggestion; the ad set still works without them.
    }
  }
  return out;
}

export function targeting(s: AdsSettings, found: { id: string; name: string }[]) {
  return {
    geo_locations: { countries: ['AU'] },
    age_min: s.ageMin,
    age_max: s.ageMax,
    ...(found.length ? { flexible_spec: [{ interests: found }] } : {}),
    targeting_automation: { advantage_audience: 1 },
  };
}

/** The campaign and its one ad set (made once, paused). */
export async function ensureCampaign(cfg: MetaConfig, s: AdsSettings, have: { campaignId: string; adsetId: string }): Promise<{ campaignId: string; adsetId: string }> {
  let { campaignId, adsetId } = have;
  if (!campaignId) {
    const c = await call<{ id: string }>(cfg, 'POST', `/${cfg.account}/campaigns`, {
      name: 'The Yes List: couples (Ads bot)',
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: 'false',
    });
    campaignId = c.id;
  }
  if (!adsetId) {
    const a = await call<{ id: string }>(cfg, 'POST', `/${cfg.account}/adsets`, {
      name: 'Australia, couples planning a wedding',
      campaign_id: campaignId,
      daily_budget: s.dailyCapCents,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      targeting: targeting(s, await interests(cfg)),
      status: 'PAUSED',
    });
    adsetId = a.id;
  }
  return { campaignId, adsetId };
}

/** Uploads our image (from the site itself), makes the creative and the ad, live. Returns the ad's id. */
export async function publishAd(cfg: MetaConfig, env: Env, adsetId: string, v: AdVariant): Promise<string> {
  const img = AD_IMAGES.find((i) => i.id === v.image);
  if (!img) throw new MetaError('That image isn’t one of ours.');
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const file = await fetch(`${base}${img.file}`);
  if (!file.ok) throw new MetaError('The ad image couldn’t be read from the site.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const up = await call<{ images?: Record<string, { hash: string }> }>(cfg, 'POST', `/${cfg.account}/adimages`, { bytes: btoa(bin) });
  const hash = Object.values(up.images ?? {})[0]?.hash;
  if (!hash) throw new MetaError('Meta didn’t keep the image.');
  const link = adLink(base, v.id);
  const creative = await call<{ id: string }>(cfg, 'POST', `/${cfg.account}/adcreatives`, {
    name: `Yes List ${v.id}`,
    object_story_spec: {
      page_id: cfg.page,
      ...(cfg.ig ? { instagram_user_id: cfg.ig } : {}),
      link_data: { image_hash: hash, link, message: v.primary, name: v.headline, ...(v.description ? { description: v.description } : {}), call_to_action: { type: v.cta, value: { link } } },
    },
  });
  const ad = await call<{ id: string }>(cfg, 'POST', `/${cfg.account}/ads`, { name: `Yes List ${v.id}`, adset_id: adsetId, creative: { creative_id: creative.id }, status: 'ACTIVE' });
  return ad.id;
}

/** On or off: an ad, the ad set or the campaign. */
export const setStatus = (cfg: MetaConfig, id: string, on: boolean) => call<{ success?: boolean }>(cfg, 'POST', `/${id}`, { status: on ? 'ACTIVE' : 'PAUSED' });
export const setDailyBudget = (cfg: MetaConfig, adsetId: string, cents: number) => call<{ success?: boolean }>(cfg, 'POST', `/${adsetId}`, { daily_budget: cents });

/** Spend, impressions and clicks per ad, since each began (spend in cents). */
export async function adInsights(cfg: MetaConfig, adsetId: string): Promise<Record<string, { spendCents: number; impressions: number; clicks: number }>> {
  const r = await call<{ data?: { ad_id: string; spend?: string; impressions?: string; clicks?: string }[] }>(cfg, 'GET', `/${adsetId}/insights`, { level: 'ad', fields: 'ad_id,spend,impressions,clicks', date_preset: 'maximum', limit: 100 });
  return Object.fromEntries(
    (r.data ?? []).map((d) => [d.ad_id, { spendCents: Math.round(Number(d.spend ?? 0) * 100) || 0, impressions: Number(d.impressions ?? 0) || 0, clicks: Number(d.clicks ?? 0) || 0 }]),
  );
}
