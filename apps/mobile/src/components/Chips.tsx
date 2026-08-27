import { Pressable, Text, View } from 'react-native';

export interface ChipOption {
  key: string;
  label: string;
}

/**
 * Single-select suggestion chips, used for goal and occupation (§2.1). The
 * options come from packages/shared, so this component never hardcodes a list.
 */
export function Chips({
  options,
  selected,
  onSelect,
}: {
  options: readonly ChipOption[];
  selected: string | null;
  onSelect: (key: string) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {options.map((option) => {
        const active = option.key === selected;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(option.key)}
            className={`rounded-full border px-4 py-2 ${
              active ? 'border-brand bg-brand' : 'border-surface-border bg-surface'
            }`}
          >
            <Text className={`text-sm ${active ? 'font-semibold text-brand-fg' : 'text-ink'}`}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
