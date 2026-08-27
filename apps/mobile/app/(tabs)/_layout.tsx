import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';

/**
 * The five tabs from §5.2. Icons are text glyphs for now; a proper icon set is
 * part of the Phase 6 polish pass.
 */
const icon = (glyph: string) => {
  const Icon = ({ color }: { color: ColorValue }) => (
    <Text style={{ color, fontSize: 18 }}>{glyph}</Text>
  );
  Icon.displayName = `TabIcon(${glyph})`;
  return Icon;
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#94a3b8',
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: icon('✓') }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: icon('◍') }} />
      <Tabs.Screen name="buddies" options={{ title: 'Buddies', tabBarIcon: icon('☺') }} />
      <Tabs.Screen name="board" options={{ title: 'Board', tabBarIcon: icon('▲') }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
