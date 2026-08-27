import { draftToPatch } from '@/onboarding/draft';

const base = {
  displayName: 'Masoud',
  handle: 'Masoud_99',
  timezone: 'Asia/Muscat',
  goalKey: 'thesis',
  goalText: '',
  occupationKey: 'student_grad',
  occupationText: '',
  isOpenBuddy: true,
  headline: '',
  about: '',
  availability: '',
};

describe('draftToPatch', () => {
  it('lowercases the handle', () => {
    expect(draftToPatch(base).handle).toBe('masoud_99');
  });

  it('omits empty optional text rather than sending ""', () => {
    const patch = draftToPatch(base);
    expect(patch.goalText).toBeUndefined();
    expect(patch.occupationText).toBeUndefined();
  });

  it('trims text that was provided', () => {
    expect(draftToPatch({ ...base, goalText: '  Finish my thesis  ' }).goalText).toBe(
      'Finish my thesis',
    );
  });

  it('includes a buddy profile only when open to requests', () => {
    expect(draftToPatch({ ...base, isOpenBuddy: true, headline: 'Up at 6' })).toMatchObject({
      buddyProfile: { headline: 'Up at 6' },
    });
    expect(draftToPatch({ ...base, isOpenBuddy: false, headline: 'Up at 6' }).buddyProfile).toBeUndefined();
  });

  it('passes the detected timezone through', () => {
    expect(draftToPatch(base).timezone).toBe('Asia/Muscat');
  });
});
