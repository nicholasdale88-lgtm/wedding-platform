import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { actionWords, Inbox } from '../src/company/Inbox';
import type { CompanyTask } from '../src/lib/api';

/** Overview's inbox: a bot's draft waits; Approve runs it (with any words changed) as you, then marks it done. */
describe('Company inbox', () => {
  afterEach(() => vi.unstubAllGlobals());
  const tasks: CompanyTask[] = [
    { id: 't1', kind: 'approve', title: 'Reply to Alex about seating', body: 'They asked about bigger rooms.', action: { method: 'POST', path: '/feedback/abc/reply', body: { text: 'Hi Alex, coming soon!' } }, status: 'waiting', result: '', createdAt: new Date().toISOString(), decidedAt: null, from: 'Grok' },
    { id: 't2', kind: 'report', title: 'Weekly brief', body: '3 sign-ups', action: null, status: 'waiting', result: '', createdAt: new Date().toISOString(), decidedAt: null, from: 'Grok' },
  ];
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

  it('approves a draft with your changes, then clears it', async () => {
    const calls: { url: string; method: string; body: unknown }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null });
        return url === '/api/a/company/tasks' ? json({ tasks }) : json({ ok: true });
      }),
    );
    const onNote = vi.fn();
    const onCount = vi.fn();
    render(<Inbox onNote={onNote} onCount={onCount} />);
    expect(await screen.findByText('Reply to Alex about seating')).toBeTruthy();
    await waitFor(() => expect(onCount).toHaveBeenLastCalledWith(2));
    expect(screen.getByText('Approve: Emails this reply to the couple')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/The draft/), { target: { value: 'Hi Alex, bigger rooms arrive next week!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(onNote).toHaveBeenCalledWith('Approved: Reply to Alex about seating'));
    const ran = calls.find((c) => c.url === '/api/a/company/feedback/abc/reply')!;
    expect(ran).toMatchObject({ method: 'POST', body: { text: 'Hi Alex, bigger rooms arrive next week!' } });
    const decided = calls.find((c) => c.url === '/api/a/company/tasks/t1')!;
    expect(decided).toMatchObject({ method: 'PUT', body: { status: 'done' } });
    expect(calls.indexOf(ran)).toBeLessThan(calls.indexOf(decided));
  });

  it('keeps a draft waiting when the action is refused, and says nothing changed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/api/a/company/tasks' ? json({ tasks }) : json({ error: { code: 'forbidden', message: 'Your role can’t do that. Ask an owner.' } }, 403))),
    );
    render(<Inbox onNote={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Nothing was changed/);
  });

  it('says what each action does in plain words', () => {
    expect(actionWords({ method: 'POST', path: '/weddings/alex-sam/refund', body: { cents: 8800 } })).toBe('Refunds the couple ($88)');
    expect(actionWords({ method: 'POST', path: '/prospects/invite', body: { ids: ['a'] } })).toBe('Emails invitations to the chosen vendors');
  });
});
