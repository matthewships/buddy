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
 * **`crossOrigin` is load-bearing, not decoration.** The API runs `secureHeaders()`,
 * which sets `Cross-Origin-Resource-Policy: same-origin` on every response
 * including `/api/media/*`. A plain `<img src>` to another origin is a `no-cors`
 * request, and CORP would refuse it — every avatar would silently fail to load
 * here while working fine in the Expo app, which is not a browser and never
 * applies CORP. Setting `crossOrigin` makes it a CORS request instead, which
 * CORP does not police and which the route's `Access-Control-Allow-Origin: *`
 * already satisfies. The alternative was relaxing CORP in the API, which would
 * have weakened it for the sake of the web client.
 *
 * Avatar keys are content-addressed and never rewritten — a new avatar is a new
 * key — so the image is cached hard by the CDN and the browser.
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
      <div
        aria-label={`${displayName}, no photo`}
        role="img"
        className="flex shrink-0 items-center justify-center rounded-full bg-people font-semibold text-people-fg"
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {initials(displayName)}
      </div>
    );
  }

  return (
    <img
      src={uri}
      alt={`${displayName}'s photo`}
      crossOrigin="anonymous"
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="shrink-0 rounded-full object-cover"
      style={{ width: size, height: size }}
    />
  );
}
