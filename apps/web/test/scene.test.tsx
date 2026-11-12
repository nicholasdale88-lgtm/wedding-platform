import { InvitationContent, SCENES } from '@wp/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { sceneArt, SceneOverlay } from '../src/guest/invitation/Scene';
import { sceneOf, SIGNATURE, SIGNATURE_NAMES, THEME_NAMES } from '../src/guest/themeKit';

const colours = { paper: '#fbf3f1', ink: '#4a1f2b', accent: '#c9a27a', soft: '#ecd0cf', envelope: '#6b2737' };

describe('opening scenes', () => {
  it('each Signature design comes with its own scene, and is one of the designs', () => {
    expect(SIGNATURE_NAMES.length).toBeGreaterThanOrEqual(7);
    // Daytime first: no evening scene among the first five.
    expect(SIGNATURE_NAMES.slice(0, 5).map((n) => SIGNATURE[n]!.scene)).not.toContain('curtain');
    for (const n of SIGNATURE_NAMES) {
      expect(THEME_NAMES).toContain(n);
      expect(sceneOf(n)).toBe(SIGNATURE[n]!.scene);
    }
    // Other designs open with the envelope, unless the couple chose a scene; "none" turns a scene off.
    expect(sceneOf('Cream & Sage')).toBe('none');
    expect(sceneOf('Cream & Sage', 'curtain')).toBe('curtain');
    expect(sceneOf('Rosewood Doors', 'none')).toBe('none');
    expect(sceneOf('Rosewood Doors', 'auto')).toBe('doors');
  });

  it('is saved with the invitation, and only a known scene', () => {
    for (const s of SCENES) expect(InvitationContent.safeParse({ scene: s }).success).toBe(true);
    expect(InvitationContent.safeParse({ scene: 'fireworks' }).success).toBe(false);
  });

  it('draws every scene with its art, the guest’s name and “Tap to open”, lets the tap through, and leaves once open', () => {
    for (const kind of ['doors', 'barn', 'book', 'gates', 'beach', 'bow', 'curtain', 'lanterns'] as const) {
      const { container, rerender, unmount } = render(<SceneOverlay kind={kind} phase={0} colours={colours} initials="H & T" guestName="Emma & Tom" />);
      const root = container.querySelector(`[data-scene="${kind}"]`) as HTMLElement;
      expect(root).toBeTruthy();
      expect(root.style.pointerEvents).toBe('none');
      expect(root.textContent).toContain('Emma & Tom');
      expect(root.textContent).toContain('Tap to open');
      // Drawn as images (SVG), in the design's colours.
      const art = Object.values(sceneArt(kind, colours, 'H & T')).join(' ');
      expect(art).toContain('data:image/svg+xml');
      // In the design's colours: another palette draws it differently.
      expect(Object.values(sceneArt(kind, { ...colours, envelope: '#1f4a3a', accent: '#b39563', soft: '#cfe6ec', ink: '#234a5e' }, 'H & T')).join(' ')).not.toBe(art);
      rerender(<SceneOverlay kind={kind} phase={2} colours={colours} initials="H & T" guestName="Emma & Tom" />);
      expect((container.querySelector(`[data-scene="${kind}"]`) as HTMLElement).style.opacity).toBe('0');
      rerender(<SceneOverlay kind={kind} phase={3} colours={colours} initials="H & T" guestName="Emma & Tom" />);
      expect(container.querySelector('[data-scene]')).toBeNull();
      unmount();
    }
  });

  it('the doors carry a wax seal with the couple’s initials, and two doors lit alike', () => {
    const art = sceneArt('doors', colours, 'H & T');
    expect(decodeURIComponent(art.seal!)).toContain('H &amp; T');
    expect(art.door).not.toBe(art.door2);
  });
});
