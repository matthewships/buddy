import { render, screen, userEvent } from '@testing-library/react-native';

import { Button } from '@/components/Button';

/**
 * Note: `render` is asynchronous in React Native Testing Library 14 — it
 * returns a promise rather than the query object v12 returned — so every
 * render here is awaited.
 */
describe('Button', () => {
  it('renders its label', async () => {
    await render(<Button label="Send request" />);
    expect(screen.getByText('Send request')).toBeOnTheScreen();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(<Button label="Accept" onPress={onPress} />);
    await userEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire while loading, and hides the label for the spinner', async () => {
    const onPress = jest.fn();
    await render(<Button label="Accept" loading onPress={onPress} />);
    expect(screen.queryByText('Accept')).toBeNull();
    await userEvent.press(screen.getByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('marks itself disabled for assistive technology', async () => {
    await render(<Button label="Accept" disabled />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('varies its classes by variant and disabled state', async () => {
    // NativeWind turns className into styles in the Metro transform, which
    // jest-expo does not run — under Jest the class string is passed through
    // untouched. So this asserts the class strings the component builds, and
    // the actual class-to-style compilation is covered by the Metro export
    // (`npm run export`) rather than here.
    await render(<Button label="Accept" variant="danger" disabled />);
    const className = screen.getByRole('button').props.className as string;
    expect(className).toContain('bg-danger');
    expect(className).toContain('opacity-50');
  });
});
