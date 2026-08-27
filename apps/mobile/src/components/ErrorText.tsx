import { Text } from 'react-native';

/** Renders a submission error, or nothing. */
export function ErrorText({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text className="text-sm text-danger" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}
