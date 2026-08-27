import { formatRemaining } from '@/hooks/useCountdown';

/**
 * The 5-minute buddy-request window is shown as m:ss under the buddy's name
 * (§2.2), so the boundary formatting matters more than the ticking itself.
 */
describe('formatRemaining', () => {
  it.each([
    [300_000, '5:00'],
    [272_000, '4:32'],
    [60_000, '1:00'],
    [59_400, '1:00'],
    [9_000, '0:09'],
    [1, '0:01'],
    [0, '0:00'],
  ])('formats %ims as %s', (ms, expected) => {
    expect(formatRemaining(ms)).toBe(expected);
  });
});
