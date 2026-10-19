import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDocSave } from '../src/admin/planner/useDocSave';

/** Planner saves: quick changes in a row each go with the version the last one returned. */
describe('useDocSave', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends saves one at a time, each with the newest version', async () => {
    const seen: string[] = [];
    let v = 3;
    vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
      seen.push((init.headers as Record<string, string>)['If-Match']!);
      await new Promise((r) => setTimeout(r, 5));
      v += 1;
      return new Response(JSON.stringify({ data: JSON.parse(String(init.body)), version: v }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const { result } = renderHook(() => useDocSave<{ n: number }>('w1', 'checklist', '', 3));
    const [a, b, c] = await Promise.all([result.current({ n: 1 }), result.current({ n: 2 }), result.current({ n: 3 })]);
    expect(seen).toEqual(['3', '4', '5']);
    expect([a.version, b.version, c.version]).toEqual([4, 5, 6]);
  });

  it('a failed save does not stop the next one', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls++;
      return calls === 1
        ? new Response(JSON.stringify({ error: { code: 'conflict', message: 'Changed elsewhere' } }), { status: 409, headers: { 'content-type': 'application/json' } })
        : new Response(JSON.stringify({ data: {}, version: 9 }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const { result } = renderHook(() => useDocSave<object>('w1', 'gifts', '', 1));
    await expect(result.current({})).rejects.toBeTruthy();
    expect((await result.current({})).version).toBe(9);
  });
});
