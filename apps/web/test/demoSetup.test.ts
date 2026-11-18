import { beforeEach, describe, expect, it } from 'vitest';
import { demoRequest, readDemoPages } from '../src/try/demo';

/** The sample app's Setup: the sample invitation, changeable, kept in this tab for the preview beside it. */
describe('sample Setup (Company → Preview, Try the app)', () => {
  beforeEach(() => sessionStorage.clear());

  it('opens the sample invitation, and a change is kept for the preview', async () => {
    type P = { version: number; slug: string; theme: string; names: { name1: string }; invitation: { custom?: { paper?: string }; images?: { lookout?: string } } };
    const first = await demoRequest<P>('/a/w/demo/pages');
    expect(first.names.name1).toBe('Harriet Lane');
    expect(first.slug).toBe('harriet-and-theo-sample');
    const saved = await demoRequest<P>('/a/w/demo/pages', { method: 'PUT', body: JSON.stringify({ invitation: { ...first.invitation, custom: { paper: '#f6f4ec' }, images: { lookout: 'data:image/jpeg;base64,AAAA' } } }) });
    expect(saved.version).toBeGreaterThan(first.version);
    expect(saved.invitation.custom?.paper).toBe('#f6f4ec');
    expect((readDemoPages()?.invitation as P['invitation']).images?.lookout).toMatch(/^data:image/);
    // Opening Setup again shows the change.
    expect((await demoRequest<P>('/a/w/demo/pages')).invitation.custom?.paper).toBe('#f6f4ec');
  });

  it('has a night-before guide, changeable, that the sample guide page shows', async () => {
    type G = { guides: Record<string, { style: string; arrive?: string }> };
    const first = await demoRequest<G>('/a/w/demo/pages');
    expect(first.guides.wedding?.style).toBe('reception');
    await demoRequest('/a/w/demo/pages', { method: 'PUT', body: JSON.stringify({ guides: { wedding: { ...first.guides.wedding, arrive: '1:00pm' } } }) });
    const { sampleGuide } = await import('../src/sales/sampleGuide');
    expect((sampleGuide(true).guide as { arrive?: string }).arrive).toBe('1:00pm');
    expect((sampleGuide(false).guide as { arrive?: string }).arrive).toBe('1:30pm');
  });

  it('the sample photo page is open, for the sample guest, with its own wording', async () => {
    const { samplePhotos } = await import('../src/sales/sampleGuide');
    const p = samplePhotos();
    expect(p.open).toBe(true);
    expect(p.event?.key).toBe('wedding');
    expect(Object.keys(p.texts).length).toBeGreaterThan(0);
    expect(Object.keys(p.texts).every((k) => k.startsWith('ph.'))).toBe(true);
  });

  it('Ask answers in the sample, with buttons to open a screen or add a task', async () => {
    expect(await demoRequest<{ on: boolean }>('/a/w/demo/planner/ask')).toMatchObject({ on: true });
    const r = await demoRequest<{ answer: string; actions: { kind: string }[] }>('/a/w/demo/planner/ask', { method: 'POST', body: JSON.stringify({ question: 'Who still hasn’t replied?', history: [], page: 'guests' }) });
    expect(r.answer).toMatch(/haven’t replied/);
    expect(r.actions[0]).toMatchObject({ kind: 'open', screen: 'texts' });
  });

  it('the sample message board takes a post, a heart and a reply, for this visit only', async () => {
    const { sampleBoard } = await import('../src/sales/sampleBoard');
    const before = await sampleBoard.board();
    expect(before.posts.length).toBeGreaterThan(0);
    await sampleBoard.boardPost('s', 't', 'Congratulations!');
    const after = await sampleBoard.board();
    expect(after.posts[0]).toMatchObject({ body: 'Congratulations!', mine: true });
    const liked = await sampleBoard.boardLike('s', 't', after.posts[0]!.id);
    expect(liked).toEqual({ liked: true, likes: 1 });
    await sampleBoard.boardPost('s', 't', 'Thank you!', after.posts[0]!.id);
    expect((await sampleBoard.board()).posts[0]!.replies).toHaveLength(1);
  });

  it('the sample forecast gives the chance of rain as a number, like the real forecast (never "0%% rain")', async () => {
    const { sampleGuide } = await import('../src/sales/sampleGuide');
    for (const h of sampleGuide(false).weather?.hours ?? []) expect(h.rain).toMatch(/^\d+$/);
  });

  it('sharing a preview link says it isn’t in the sample', async () => {
    await expect(demoRequest('/a/w/demo/pages/share', { method: 'POST', body: JSON.stringify({ on: true }) })).rejects.toThrow(/sample/);
  });
});
