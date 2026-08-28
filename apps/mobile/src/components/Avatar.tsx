import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { API_URL } from '@/api/client';

/** The public URL for an avatar key, or null when the user has no avatar. */
export function avatarUrl(avatarKey: string | null | undefined): string | null {
  return avatarKey ? `${API_URL}/api/media/${encodeURIComponent(avatarKey)}` : null;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || '?';
}

/**
 * An avatar, falling back to initials.
 *
 * Avatar keys are content-addressed and never rewritten — a new avatar is a new
 * key — so the image is cached hard on both the CDN and the device.
 */
export function Avatar({
  avatarKey,
  displayName,
  size = 44,
}: {
  avatarKey: string | null | undefined;
  displayName: string;
  size?: number;
}) {
  const uri = avatarUrl(avatarKey);

  if (!uri) {
    return (
      <View
        accessibilityLabel={`${displayName}, no photo`}
        className="items-center justify-center rounded-full bg-brand-muted"
        style={{ width: size, height: size }}
      >
        <Text className="font-semibold text-brand" style={{ fontSize: size * 0.38 }}>
          {initials(displayName)}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      accessibilityLabel={`${displayName}'s photo`}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={150}
    />
  );
}
