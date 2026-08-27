import { activityLabel } from '@/lib/activity';

const now = new Date('2026-08-27T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('activityLabel', () => {
  it('handles a user who has never been seen', () => {
    expect(activityLabel(null, now)).toBe('New here');
  });

  it.each([
    [0, 'Active now'],
    [90_000, 'Active now'],
    [5 * 60_000, 'Active 5 min ago'],
    [59 * 60_000, 'Active 59 min ago'],
    [3 * 3_600_000, 'Active 3h ago'],
    [26 * 3_600_000, 'Active yesterday'],
    [5 * 86_400_000, 'Active 5d ago'],
  ])('formats %ims ago as %s', (elapsed, expected) => {
    expect(activityLabel(ago(elapsed), now)).toBe(expected);
  });
});
