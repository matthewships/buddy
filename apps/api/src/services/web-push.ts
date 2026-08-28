/**
 * Web Push (§4.6): VAPID authentication and RFC 8291 payload encryption.
 *
 * A browser cannot receive Expo push, so everything the mobile app gets by
 * handing Expo a token has to be done here by hand: sign a JWT that identifies
 * this server to the push service (RFC 8292), encrypt the payload so the push
 * service relaying it cannot read it (RFC 8291), and POST the result to the
 * subscription's endpoint (RFC 8030).
 *
 * **Why no library.** The whole of it is four WebCrypto calls and a header
 * layout, all of it fully specified, and the repo already hand-rolls PBKDF2
 * password hashing and its own rate limiter for the same reason: a dependency
 * in the push path is a dependency in the auth path's blast radius. What makes
 * that safe here is that RFC 8291 publishes intermediate values for a worked
 * example — `test/web-push.test.ts` pins this code against those bytes, so a
 * misreading of the spec fails the suite rather than shipping.
 *
 * **Everything is a parameter, nothing is read from `env`.** The caller looks
 * up the VAPID keys once; these functions stay pure, which is what lets the
 * test drive them with the RFC's fixed salt and keypair instead of random ones.
 */

/** RFC 8291 §4: header (86) + padding delimiter (1) + GCM tag (16) out of 4096. */
export const MAX_PUSH_PAYLOAD_BYTES = 3993;

/** The single record size written into the header; the payload is always one record. */
const RECORD_SIZE = 4096;

/** RFC 8292 §2: push services reject a `exp` more than 24 hours out. */
const VAPID_TTL_SECONDS = 12 * 60 * 60;

const encoder = new TextEncoder();

export interface WebPushSubscriptionKeys {
  endpoint: string;
  /** The subscription's P-256 public key, base64url (`ua_public`). */
  p256dh: string;
  /** The 16-byte shared auth secret, base64url. */
  auth: string;
}

export interface VapidKeys {
  /** Uncompressed P-256 point, 65 bytes, base64url — the same value the browser subscribes with. */
  publicKey: string;
  /** The raw 32-byte scalar, base64url. */
  privateKey: string;
  /** `mailto:` or `https:` contact, so a push service operator can reach us. */
  subject: string;
}

/* ------------------------------------------------------------------ *
 * base64url
 * ------------------------------------------------------------------ */

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * RFC 8291 payload encryption
 * ------------------------------------------------------------------ */

/**
 * One HKDF-SHA256 derivation. RFC 8291 §3.4 writes the derivations out as
 * separate HMAC steps for clarity, but each pair is exactly extract-then-expand
 * with a single-block output, which is what WebCrypto's HKDF does in one call.
 */
async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  bytes: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    bytes * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypts one push message body (`Content-Encoding: aes128gcm`).
 *
 * `overrides` exists for the RFC 8291 Appendix A test and nothing else:
 * production callers pass neither, and get a fresh random salt and a fresh
 * ephemeral keypair — both of which MUST be new for every message, since
 * reusing a salt with the same subscription reuses the AES-GCM nonce.
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  subscription: Pick<WebPushSubscriptionKeys, 'p256dh' | 'auth'>,
  overrides: { salt?: Uint8Array; serverKeyPair?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PUSH_PAYLOAD_BYTES) {
    throw new Error(`Push payload too large: ${plaintext.length} > ${MAX_PUSH_PAYLOAD_BYTES}`);
  }

  const uaPublicBytes = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicBytes as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );

  const serverKeyPair =
    overrides.serverKeyPair ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair);

  const serverPublicBytes = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  );

  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));

  // ecdh_secret = ECDH(as_private, ua_public)
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, serverKeyPair.privateKey, 256),
  );

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const keyInfo = concat(
    encoder.encode('WebPush: info'),
    new Uint8Array([0]),
    uaPublicBytes,
    serverPublicBytes,
  );
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);

  // The RFC 8188 derivations. The info strings are NUL-terminated; the salt is
  // the one written into the header, so the receiver can repeat this.
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, [
    'encrypt',
  ]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource, tagLength: 128 },
      aesKey,
      // 0x02 is the padding delimiter for the *last* record, and this is always
      // the only record. A receiver that sees anything else discards the
      // message, so this octet is not optional.
      concat(plaintext, new Uint8Array([2])) as BufferSource,
    ),
  );

  // Header: salt(16) || rs(4, big-endian) || idlen(1) || keyid, where the keyid
  // is our ephemeral public key — the receiver has no other way to get it.
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE, false);

  return concat(
    salt,
    recordSize,
    new Uint8Array([serverPublicBytes.length]),
    serverPublicBytes,
    ciphertext,
  );
}

/* ------------------------------------------------------------------ *
 * RFC 8292 VAPID
 * ------------------------------------------------------------------ */

/**
 * Imports the raw VAPID scalar for signing.
 *
 * WebCrypto will not import a bare 32-byte private key, so it is assembled into
 * a JWK with the public point split out of `publicKey` — which is why both
 * halves of the pair are needed to sign, not just the private one.
 */
async function importVapidPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const publicBytes = base64UrlDecode(keys.publicKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04) {
    throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  }

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: base64UrlEncode(publicBytes.slice(1, 33)),
      y: base64UrlEncode(publicBytes.slice(33, 65)),
      d: keys.privateKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * The `Authorization` header value proving this server owns the VAPID key the
 * browser subscribed with.
 *
 * `aud` is the *origin* of the endpoint, not the endpoint itself — Apple's push
 * service in particular rejects the full URL.
 */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now: number = Date.now(),
): Promise<string> {
  const audience = new URL(endpoint).origin;

  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(now / 1000) + VAPID_TTL_SECONDS,
        sub: keys.subject,
      }),
    ),
  );

  const signingInput = `${header}.${claims}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      await importVapidPrivateKey(keys),
      encoder.encode(signingInput) as BufferSource,
    ),
  );

  // WebCrypto emits the raw r||s pair ES256 wants, so no DER unwrapping.
  return `vapid t=${signingInput}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

/* ------------------------------------------------------------------ *
 * Delivery
 * ------------------------------------------------------------------ */

export interface WebPushResult {
  status: number;
  /**
   * The push service says this subscription no longer exists (404 or 410), so
   * the row should be deleted — the browser's equivalent of Expo's
   * `DeviceNotRegistered`.
   */
  gone: boolean;
}

/**
 * Delivers one encrypted message to one subscription.
 *
 * Returns the outcome rather than throwing on a rejection: a single browser
 * endpoint failing must not fail the batch it shares with everyone else's
 * notifications. Only a transport-level error throws.
 */
export async function sendWebPush(
  subscription: WebPushSubscriptionKeys,
  payload: string,
  keys: VapidKeys,
  options: { ttlSeconds: number; urgency?: 'very-low' | 'low' | 'normal' | 'high' } = {
    ttlSeconds: 300,
  },
): Promise<WebPushResult> {
  const body = await encryptPayload(encoder.encode(payload), subscription);

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuthorization(subscription.endpoint, keys),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: String(options.ttlSeconds),
      urgency: options.urgency ?? 'normal',
    },
    body: body as BodyInit,
  });

  // The body is drained even when unused: leaving it open holds a connection
  // open for the rest of the invocation.
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    if (response.status !== 404 && response.status !== 410) {
      console.error('[web-push:rejected]', response.status, detail.slice(0, 200));
    }
  } else {
    await response.body?.cancel().catch(() => {});
  }

  return {
    status: response.status,
    gone: response.status === 404 || response.status === 410,
  };
}
