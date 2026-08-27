import { forwardRef } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

export interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string | null;
}

/**
 * A labelled text input. The error is rendered as text rather than only as a red
 * border, and tied to the input via accessibility props so screen readers
 * announce it.
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, error, hint, ...rest },
  ref,
) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-ink-muted">{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={hint ?? undefined}
        placeholderTextColor="#94a3b8"
        className={`h-12 rounded-xl border bg-surface px-4 text-base text-ink ${
          error ? 'border-danger' : 'border-surface-border'
        }`}
        {...rest}
      />
      {error ? (
        <Text className="text-sm text-danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text className="text-sm text-ink-subtle">{hint}</Text>
      ) : null}
    </View>
  );
});
