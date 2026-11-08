import { HELP, HELP_SAY } from '@wp/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Walkthrough } from '../src/admin/help/Walkthrough';

/** Help's walkthroughs: the natural voice when there is one, and never silence when there isn't. */
describe('Walkthrough narration', () => {
  const speakSpy = () => {
    const spoken: string[] = [];
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    });
    vi.stubGlobal('speechSynthesis', {
      speak: (u: { text: string }) => spoken.push(u.text),
      cancel: () => {},
      getVoices: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    return spoken;
  };
  const guide = HELP.find((a) => a.id === 'guests')!;
  const show = () =>
    render(
      <MemoryRouter>
        <Walkthrough guides={[guide]} where={() => '/'} onClose={() => {}} />
      </MemoryRouter>,
    );

  it('asks for the natural voice, and reads the same friendly words with the device voice when that fails', async () => {
    const spoken = speakSpy();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: { code: 'off', message: 'off' } }), { status: 503, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    show();
    await waitFor(() => expect(spoken[0]).toBe(HELP_SAY.guests!.intro));
    expect(String((fetch.mock.calls[0] as unknown[])[0])).toMatch(/^\/api\/a\/help\/voice\?id=guests&step=-1&v=/);
    // Captions show what's being said.
    expect(screen.getByTestId('captions').textContent).toBe(HELP_SAY.guests!.intro);
    // On to the next step: still the device voice (no asking again), with the spoken line, not the on-screen text.
    const asked = fetch.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(spoken[spoken.length - 1]).toBe(HELP_SAY.guests!.steps[0]));
    expect(fetch.mock.calls.length).toBe(asked);
  });

  it('falls back when the network fails too, and the speed control cycles 0.9×, 1×, 1.25×', async () => {
    const spoken = speakSpy();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    show();
    await waitFor(() => expect(spoken[0]).toBe(HELP_SAY.guests!.intro));
    const speed = screen.getByRole('button', { name: /Speed/ });
    expect(speed.textContent).toBe('1×');
    fireEvent.click(speed);
    expect(screen.getByRole('button', { name: /Speed/ }).textContent).toBe('1.25×');
    fireEvent.click(screen.getByRole('button', { name: /Speed/ }));
    expect(screen.getByRole('button', { name: /Speed/ }).textContent).toBe('0.9×');
  });
});
