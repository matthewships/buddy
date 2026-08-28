import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { API_URL } from '@/api/client';
import { getAccessToken } from '@/auth/session';

import { api, unwrap } from './client';
import { meQueryKey } from './auth';

/**
 * Avatar upload (§4.4).
 *
 * Two steps: ask the API for a key, then PUT the bytes to the Worker. The upload
 * uses bare `fetch` rather than the typed client because it sends a binary body
 * rather than JSON, and the key is checked server-side against the caller's own
 * id — a client-supplied key is not trusted.
 */
export function usePickAndUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<{ cancelled: boolean; avatarKey?: string }> => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Photo access is needed to choose an avatar');
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        // Avatars render at most ~88px, so a large upload is wasted bytes and
        // risks the 5 MB server cap.
        quality: 0.7,
      });
      if (picked.canceled || !picked.assets[0]) return { cancelled: true };

      const asset = picked.assets[0];
      const { key, uploadUrl } = await unwrap<{ key: string; uploadUrl: string }>(
        await api.api.me.avatar.$post(),
      );

      const token = await getAccessToken();
      const bytes = await (await fetch(asset.uri)).arrayBuffer();

      const response = await fetch(`${API_URL}${uploadUrl}`, {
        method: 'PUT',
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'content-type': asset.mimeType ?? 'image/jpeg',
        },
        body: bytes,
      });

      const body = await unwrap<{ avatarKey: string }>(response);
      return { cancelled: false, avatarKey: body.avatarKey ?? key };
    },
    onSuccess: (result) => {
      if (!result.cancelled) {
        void queryClient.invalidateQueries({ queryKey: meQueryKey });
      }
    },
  });
}
