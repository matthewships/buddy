import { localToday } from '@/api/tasks';

describe('localToday', () => {
  it('returns the device local day, not the UTC day', () => {
    const value = localToday();
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Built from local getters, so it must agree with the local date parts —
    // toISOString() would silently return the UTC day and be off by one for
    // anyone east or west of UTC at the wrong hour.
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`;
    expect(value).toBe(expected);
  });
});
