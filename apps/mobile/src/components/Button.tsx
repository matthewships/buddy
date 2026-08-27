import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const CONTAINER: Record<Variant, string> = {
  primary: 'bg-brand active:opacity-80',
  secondary: 'bg-brand-muted active:opacity-80',
  ghost: 'bg-transparent border border-surface-border active:opacity-60',
  danger: 'bg-danger active:opacity-80',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-brand-fg',
  secondary: 'text-brand',
  ghost: 'text-ink',
  danger: 'text-white',
};

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: Variant;
  loading?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  disabled,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      className={`h-12 flex-row items-center justify-center rounded-xl px-5 ${CONTAINER[variant]} ${
        isDisabled ? 'opacity-50' : ''
      }`}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" />
      ) : (
        <Text className={`text-base font-semibold ${LABEL[variant]}`}>{label}</Text>
      )}
    </Pressable>
  );
}
