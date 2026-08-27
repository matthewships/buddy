import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Standard page frame: safe-area inset plus the app background. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView className="flex-1 bg-surface-muted" edges={['top', 'bottom']}>
      <View className="flex-1 px-5 pt-2">{children}</View>
    </SafeAreaView>
  );
}
