import { HELP_SAY, HELP_VOICE } from '@wp/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import seedJson from '../../../seed/sophie-nicholas.json';
import type { Env } from '../src/env';
import { createApp } from '../src/index';
import { hashPasscode } from '../src/lib/auth';
import { buildSeed } from '../src/seed/build';
import { testD1 } from './support/d1';

/** Help's natural voice: only the walkthroughs' own lines, for signed-in couples, made once and kept. */
describe('help voice', () => {
  let t: Awaited<ReturnType<typeof testD1>>;
  let env: Env;
  let cookie = '';
  const app = createApp();
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const voice = (q: string, withCookie = true) => app.request(`/api/a/help/voice?${q}`, { headers: withCookie ? { cookie } : {} }, env, ctx);
  const mp3 = () => {
    const b = new Uint8Array(4000).fill(7);
    b.set([0x49, 0x44, 0x33]); // "ID3"
    return b;
  };
  const run = vi.fn(async (_model: string, _input: unknown) => new Response(mp3()).body);

  beforeEach(async () => {
    t = await testD1();
    const stmts = buildSeed(seedJson, { ownerEmail: 'owner@example.com', ownerPassHash: await hashPasscode('valley-2027') });
    await t.db.batch(stmts.map((s) => t.db.prepare(s.sql).bind(...s.params)));
    run.mockClear();
    env = { DB: t.db, PUBLIC_BASE_URL: 'https://example.com', SESSION_SECRET: 'test-secret-for-sessions-000000', AI: { run } };
    const res = await app.request('/api/a/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'owner@example.com', passcode: 'valley-2027' }) }, env, ctx);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
  });
  afterEach(() => t.dispose());

  it('speaks a known step once, then plays the kept copy without asking the AI again', async () => {
    const first = await voice('id=guests&step=0');
    expect(first.status).toBe(200);
    expect(first.headers.get('content-type')).toBe('audio/mpeg');
    expect(first.headers.get('cache-control')).toBe('private, max-age=604800');
    expect((await first.arrayBuffer()).byteLength).toBe(4000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toBe(HELP_VOICE.model);
    expect(run.mock.calls[0]![1]).toMatchObject({ speaker: HELP_VOICE.speaker, text: HELP_SAY.guests!.steps[0] });

    const again = await voice('id=guests&step=0');
    expect(again.status).toBe(200);
    expect(again.headers.get('x-help-voice')).toBe('kept');
    expect((await again.arrayBuffer()).byteLength).toBe(4000);
    expect(run).toHaveBeenCalledTimes(1); // the cache hit didn't call the AI

    // The intro is step -1; the last step ends with the outro.
    expect((await voice('id=guests&step=-1')).status).toBe(200);
    expect(run.mock.calls[1]![1]).toMatchObject({ text: HELP_SAY.guests!.intro });
    const last = HELP_SAY.guests!.steps.length - 1;
    expect((await voice(`id=guests&step=${last}`)).status).toBe(200);
    expect((run.mock.calls[2]![1] as { text: string }).text).toMatch(/That’s it/);
  });

  it('refuses anything that is not a walkthrough line', async () => {
    for (const q of ['id=guests&step=99', 'id=guests&step=1.5', 'id=nope&step=0', 'id=__proto__&step=0', 'id=guests', 'text=hello&step=0', 'id=guests&step=-2']) {
      expect((await voice(q)).status, q).toBe(404);
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('is for signed-in members only', async () => {
    expect((await voice('id=guests&step=0', false)).status).toBe(401);
    await t.db.prepare(`DELETE FROM membership`).run();
    expect((await voice('id=guests&step=0')).status).toBe(403);
    expect(run).not.toHaveBeenCalled();
  });

  it('says so when the AI is off or fails, so the walkthrough uses the device voice', async () => {
    delete env.AI;
    expect((await voice('id=start&step=0')).status).toBe(503);
    const failing = vi.fn(async () => {
      throw new Error('quota');
    });
    env = { ...env, AI: { run: failing } };
    expect((await voice('id=start&step=0')).status).toBe(502);
    expect(failing).toHaveBeenCalledTimes(2); // the natural voice, then the backup voice
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM help_audio`).first<{ n: number }>())!.n).toBe(0);
  });
});
