import { describe, expect, it } from 'vitest';
import { ALL_TOOLS_OFF, ALL_TOOLS_ON, chosenTools, TOOL_KEYS, toolPatch, toolsShown } from '../src/tools';

describe('the optional tools (Settings → What you’re using)', () => {
  it('a wedding from before the switches keeps everything on; a stored choice is read as it is', () => {
    expect(chosenTools({})).toEqual(ALL_TOOLS_ON);
    expect(chosenTools(null)).toEqual(ALL_TOOLS_ON);
    expect(chosenTools({ tools: ALL_TOOLS_OFF })).toEqual(ALL_TOOLS_OFF);
    expect(chosenTools({ tools: { seating: true, photos: 'yes' } })).toEqual({ ...ALL_TOOLS_OFF, seating: true });
  });
  it('text messages show only once credits are bought; founders always have everything', () => {
    const chosen = { ...ALL_TOOLS_OFF, texts: true, seating: true };
    expect(toolsShown(chosen, { founders: false, textsBought: false })).toEqual({ ...ALL_TOOLS_OFF, seating: true });
    expect(toolsShown(chosen, { founders: false, textsBought: true })).toEqual(chosen);
    expect(toolsShown(ALL_TOOLS_OFF, { founders: true, textsBought: false })).toEqual(ALL_TOOLS_ON);
  });
  it('a change from Settings: only known tools, only true or false', () => {
    expect(toolPatch({ seating: true })).toEqual({ seating: true });
    expect(toolPatch({ seating: 'on' })).toBeNull();
    expect(toolPatch({ wallet: true })).toBeNull();
    expect(toolPatch({})).toBeNull();
    expect(toolPatch([])).toBeNull();
    expect(TOOL_KEYS).toEqual(['texts', 'photos', 'party', 'seating', 'extraEvent', 'nightBefore', 'thankYou']);
  });
});
