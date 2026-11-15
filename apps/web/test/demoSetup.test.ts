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

  it('sharing a preview link says it isn’t in the sample', async () => {
    await expect(demoRequest('/a/w/demo/pages/share', { method: 'POST', body: JSON.stringify({ on: true }) })).rejects.toThrow(/sample/);
  });
});
