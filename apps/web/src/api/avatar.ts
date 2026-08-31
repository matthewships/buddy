import { useMutation, useQueryClient } from '@tanstack/react-query';

import { getAccessToken } from '@/auth/session';

import { API_URL, api, unwrap } from './client';
import { meQueryKey } from './auth';

/**
 * Avatar upload — the web counterpart of apps/mobile/src/api/avatar.ts.
 *
 * The two-step protocol is identical: ask the API for a key, then PUT the bytes
 * to the Worker. The upload uses bare `fetch` rather than the typed client
 * because it sends a binary body rather than JSON, and the key is checked
 * server-side against the caller's own id — a client-supplied key is not
 * trusted.
 *
 * What differs is where the image comes from. Mobile launches
 * `expo-image-picker`, which handles the square crop and re-encode itself. On
 * web the caller supplies a `File` from an `<input type="file">`, so the
 * equivalent of the picker's `allowsEditing` / `aspect: [1, 1]` / `quality: 0.7`
 * is done here on a canvas. That is not cosmetic: the server caps uploads at
 * 5 MB and a modern phone camera clears that easily, so an unresized upload
 * would fail for exactly the users most likely to attempt one.
 */

/** Avatars render at most ~88px, so this is already generous for a 2x display. */
const MAX_EDGE = 256;
const JPEG_QUALITY = 0.7;

/**
 * Centre-crops to a square and downscales, mirroring the mobile picker's output.
 * Falls back to the original bytes if the browser cannot decode the file — the
 * server validates content types anyway, so a rejection there is the right
 * failure rather than a silent one here.
 */
async function toSquareJpeg(file: File): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const edge = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(edge, MAX_EDGE);

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2d context');

    // Source rectangle is the largest centred square, so the crop matches what
    // the round avatar will actually show.
    context.drawImage(
      bitmap,
      (bitmap.width - edge) / 2,
      (bitmap.height - edge) / 2,
      edge,
      edge,
      0,
      0,
      size,
      size,
    );
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('Encode failed');

    return { bytes: await blob.arrayBuffer(), contentType: 'image/jpeg' };
  } catch {
    return { bytes: await file.arrayBuffer(), contentType: file.type || 'image/jpeg' };
  }
}

export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<{ avatarKey: string }> => {
      const { bytes, contentType } = await toSquareJpeg(file);

      const { key, uploadUrl } = await unwrap<{ key: string; uploadUrl: string }>(
        await api.api.me.avatar.$post(),
      );

      const token = await getAccessToken();
      const response = await fetch(`${API_URL}${uploadUrl}`, {
        method: 'PUT',
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'content-type': contentType,
        },
        body: bytes,
      });

      const body = await unwrap<{ avatarKey: string }>(response);
      return { avatarKey: body.avatarKey ?? key };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: meQueryKey });
    },
  });
}

/**
 * A Feed photo (§2.7), uploaded through the same two-step protocol.
 *
 * Resized differently on purpose. An avatar is centre-cropped to a square
 * because that is the shape it renders in; a Feed photo is a picture of
 * something — a desk, a whiteboard, a finished page — and cropping it to a
 * square would cut the subject out. This bounds the long edge and leaves the
 * frame alone.
 *
 * Bigger than an avatar's 256px, because it renders at full column width, but
 * still bounded: the server caps uploads at 5 MB and a modern phone camera
 * clears that easily, so an unresized upload would fail for exactly the users
 * most likely to attempt one.
 */
const MAX_POST_EDGE = 1280;

async function toBoundedJpeg(file: File): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_POST_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2d context');
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );
    if (!blob) throw new Error('Encode failed');

    return { bytes: await blob.arrayBuffer(), contentType: 'image/jpeg' };
  } catch {
    // Same fallback as the avatar: the server validates content types, so a
    // rejection there is a better failure than a silent one here.
    return { bytes: await file.arrayBuffer(), contentType: file.type || 'image/jpeg' };
  }
}

export function usePostImageUpload() {
  return useMutation({
    mutationFn: async (file: File): Promise<{ key: string }> => {
      const { bytes, contentType } = await toBoundedJpeg(file);

      const { key, uploadUrl } = await unwrap<{ key: string; uploadUrl: string }>(
        await api.api.me['post-image'].$post(),
      );

      const token = await getAccessToken();
      const response = await fetch(`${API_URL}${uploadUrl}`, {
        method: 'PUT',
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'content-type': contentType,
        },
        body: bytes,
      });

      await unwrap<{ key: string }>(response);
      // The post is created separately; nothing here references the key yet.
      return { key };
    },
  });
}
