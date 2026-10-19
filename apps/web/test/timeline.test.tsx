import { InvitationContent, type TimelineItem } from '@wp/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { InvitationView } from '../src/guest/generated/InvitationView';
import { shownRows, TIMELINE_ROWS, TimelineRows } from '../src/guest/invitation/Timeline';

const row = (p: Partial<TimelineItem>): TimelineItem => ({ time: '', until: '', title: '', note: '', icon: 'arrive', ...p });

describe('invitation timeline (Guest pages → Timeline)', () => {
  it('draws the couple’s rows like the design: "to" time, icons, dotted line, closing diamond', () => {
    const { container } = render(
      <TimelineRows
        items={[
          row({ time: '2:00pm', until: '3:00pm', title: 'Ceremony', note: 'Vows at the edge', icon: 'rings' }),
          row({ time: '', title: '' }), // half-typed: left off
          row({ time: '4:00pm', until: 'to 5pm', title: 'Drinks', icon: 'drinks' }),
          row({ time: '11:00pm', title: 'Irish farewell', icon: 'end' }),
        ]}
      />,
    );
    const rows = container.querySelectorAll(':scope > div');
    expect(rows).toHaveLength(3);
    expect(screen.getByText('to 3:00pm')).toBeTruthy();
    expect(screen.getByText('to 5pm')).toBeTruthy(); // never "to to 5pm"
    expect(screen.getByText('Irish farewell')).toBeTruthy();
    expect(rows[0]!.querySelectorAll('svg')).toHaveLength(1);
    expect(rows[2]!.querySelector('svg')).toBeNull(); // the diamond, not an icon
    // A dotted line joins the first two rows, but not into the closing diamond (as in the design).
    const dotted = (r: Element) => [...r.querySelectorAll('div')].some((d) => (d as HTMLElement).style.borderLeft.includes('dotted'));
    expect(dotted(rows[0]!)).toBe(true);
    expect(dotted(rows[1]!)).toBe(false);
  });

  it('the view uses the couple’s rows when there are any, and the design’s otherwise', () => {
    const t = (k: string) => (k === 'inv.5db0b693' ? 'Design arrival row' : '');
    const mine = [row({ time: '9am', title: 'Our own moment' })];
    const rows = (key: string) => (key === TIMELINE_ROWS && shownRows(mine).length ? <TimelineRows items={mine} /> : undefined);
    const { rerender } = render(<InvitationView v={{ rows, image: () => '' }} t={t} />);
    expect(screen.getByText('Our own moment')).toBeTruthy();
    expect(screen.queryByText('Design arrival row')).toBeNull();
    rerender(<InvitationView v={{ image: () => '' }} t={t} />);
    expect(screen.getByText('Design arrival row')).toBeTruthy();
  });

  it('timeline content is checked on save: known icons only, sizes capped', () => {
    expect(InvitationContent.safeParse({ timeline: [row({ title: 'Ceremony' })] }).success).toBe(true);
    expect(InvitationContent.safeParse({ timeline: [{ ...row({}), icon: 'bomb' }] }).success).toBe(false);
    expect(InvitationContent.safeParse({ timeline: [row({ title: 'x'.repeat(121) })] }).success).toBe(false);
    expect(InvitationContent.safeParse({ timeline: Array.from({ length: 31 }, () => row({})) }).success).toBe(false);
  });
});
