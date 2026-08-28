import { describe, expect, it } from 'vitest';

import {
  base64UrlDecode,
  base64UrlEncode,
  encryptPayload,
  vapidAuthorization,
} from '../src/services/web-push.js';

/**
 * RFC 8291 Appendix A, byte for byte.
 *
 * A round-trip test — encrypt, then decrypt with the subscription's private key
 * — would pass even if the implementation misread the spec, because both halves
 * would misread it the same way. These are the published values for the worked
 * example, so they catch exactly that: a wrong `key_info` layout, a missing NUL
 * on an info string, the padding delimiter omitted, the header fields in the
 * wrong order.
 */
const VECTOR = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  /**
   * The complete message body from §5 — header and ciphertext together.
   *
   * Deliberately not Appendix A's two base64 blocks pasted end to end: 86 is
   * not a multiple of 3, so the encoding of the concatenation is not the
   * concatenation of the encodings, and joining them produces a value nothing
   * can ever match.
   */
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
} as const;

/** The example's fixed application-server keypair, which the RFC gives as raw scalars. */
async function vectorKeyPair(): Promise<CryptoKeyPair> {
  const publicBytes = base64UrlDecode(VECTOR.asPublic);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(publicBytes.slice(1, 33)),
    y: base64UrlEncode(publicBytes.slice(33, 65)),
  } as const;

  return {
    privateKey: await crypto.subtle.importKey(
      'jwk',
      { ...jwk, d: VECTOR.asPrivate, ext: true },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    ),
    publicKey: await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    ),
  };
}

describe('RFC 8291 payload encryption', () => {
  it('reproduces the Appendix A message body exactly', async () => {
    const body = await encryptPayload(
      new TextEncoder().encode(VECTOR.plaintext),
      { p256dh: VECTOR.uaPublic, auth: VECTOR.auth },
      { salt: base64UrlDecode(VECTOR.salt), serverKeyPair: await vectorKeyPair() },
    );

    expect(base64UrlEncode(body)).toBe(VECTOR.body);
  });

  it('writes a header the receiver can parse: salt, rs=4096, and a 65-byte keyid', async () => {
    const body = await encryptPayload(
      new TextEncoder().encode('hello'),
      { p256dh: VECTOR.uaPublic, auth: VECTOR.auth },
    );

    expect(new DataView(body.buffer).getUint32(16, false)).toBe(4096);
    expect(body[20]).toBe(65);
    // Uncompressed point form: the keyid must start with 0x04.
    expect(body[21]).toBe(0x04);
    // header(86) + plaintext(5) + delimiter(1) + tag(16)
    expect(body.length).toBe(86 + 5 + 1 + 16);
  });

  it('never repeats a salt or an ephemeral key across messages', async () => {
    const subscription = { p256dh: VECTOR.uaPublic, auth: VECTOR.auth };
    const plaintext = new TextEncoder().encode('same message twice');

    const first = await encryptPayload(plaintext, subscription);
    const second = await encryptPayload(plaintext, subscription);

    // Reusing either would reuse the AES-GCM nonce for this subscription.
    expect(base64UrlEncode(first.slice(0, 16))).not.toBe(base64UrlEncode(second.slice(0, 16)));
    expect(base64UrlEncode(first.slice(21, 86))).not.toBe(base64UrlEncode(second.slice(21, 86)));
  });

  it('refuses a payload larger than a push service must accept', async () => {
    await expect(
      encryptPayload(new Uint8Array(3994), { p256dh: VECTOR.uaPublic, auth: VECTOR.auth }),
    ).rejects.toThrow(/too large/);
  });

  /**
   * The receiver's half of the exchange, run with the user agent's private key:
   * proof that a real browser can decrypt what this produces, not just that the
   * bytes match a fixture.
   */
  it('produces a body the subscription itself can decrypt', async () => {
    const uaPublicBytes = base64UrlDecode(VECTOR.uaPublic);
    const uaPrivate = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: base64UrlEncode(uaPublicBytes.slice(1, 33)),
        y: base64UrlEncode(uaPublicBytes.slice(33, 65)),
        d: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
        ext: true,
      },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits'],
    );

    const message = JSON.stringify({ title: 'Approved', body: 'Ship the thing' });
    const body = await encryptPayload(new TextEncoder().encode(message), {
      p256dh: VECTOR.uaPublic,
      auth: VECTOR.auth,
    });

    const salt = body.slice(0, 16);
    const asPublic = body.slice(21, 86);
    const ciphertext = body.slice(86);

    const ecdhSecret = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'ECDH',
          public: await crypto.subtle.importKey(
            'raw',
            asPublic as BufferSource,
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            [],
          ),
        },
        uaPrivate,
        256,
      ),
    );

    const encoder = new TextEncoder();
    // `Uint8Array<ArrayBufferLike>` is not `BufferSource` to TypeScript, which
    // is a variance detail rather than anything the runtime cares about.
    const bytes = (value: Uint8Array) => value as BufferSource;
    const hkdf = async (hkdfSalt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) => {
      const key = await crypto.subtle.importKey('raw', bytes(ikm), 'HKDF', false, ['deriveBits']);
      return new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: 'HKDF', hash: 'SHA-256', salt: bytes(hkdfSalt), info: bytes(info) },
          key,
          length * 8,
        ),
      );
    };

    const keyInfo = new Uint8Array([
      ...encoder.encode('WebPush: info'),
      0,
      ...uaPublicBytes,
      ...asPublic,
    ]);
    const ikm = await hkdf(base64UrlDecode(VECTOR.auth), ecdhSecret, keyInfo, 32);
    const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

    const plaintext = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: bytes(nonce), tagLength: 128 },
        await crypto.subtle.importKey('raw', bytes(cek), 'AES-GCM', false, ['decrypt']),
        bytes(ciphertext),
      ),
    );

    expect(plaintext[plaintext.length - 1]).toBe(2); // padding delimiter
    expect(new TextDecoder().decode(plaintext.slice(0, -1))).toBe(message);
  });
});

describe('VAPID authorization', () => {
  const keys = {
    publicKey: VECTOR.asPublic,
    privateKey: VECTOR.asPrivate,
    subject: 'mailto:no-reply@localrack.xyz',
  };

  it('signs a verifiable ES256 JWT scoped to the push service origin', async () => {
    const now = Date.UTC(2026, 7, 28, 12, 0, 0);
    const header = await vapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc123?x=1',
      keys,
      now,
    );

    const match = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, jwt = '', advertisedKey] = match!;
    expect(advertisedKey).toBe(VECTOR.asPublic);

    const [encodedHeader = '', encodedClaims = '', encodedSignature = ''] = jwt.split('.');
    const decode = (part: string) => JSON.parse(new TextDecoder().decode(base64UrlDecode(part)));

    expect(decode(encodedHeader)).toEqual({ typ: 'JWT', alg: 'ES256' });

    const claims = decode(encodedClaims);
    // The origin, not the full endpoint — Apple rejects the path form.
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe(keys.subject);
    expect(claims.exp).toBeGreaterThan(now / 1000);
    expect(claims.exp - now / 1000).toBeLessThanOrEqual(24 * 60 * 60);

    // ECDSA is randomised, so the signature is verified rather than compared.
    const publicBytes = base64UrlDecode(VECTOR.asPublic);
    const verifyKey = await crypto.subtle.importKey(
      'raw',
      publicBytes as BufferSource,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      verifyKey,
      base64UrlDecode(encodedSignature) as BufferSource,
      new TextEncoder().encode(`${encodedHeader}.${encodedClaims}`) as BufferSource,
    );
    expect(valid).toBe(true);
  });

  it('rejects a public key that is not an uncompressed P-256 point', async () => {
    await expect(
      vapidAuthorization('https://example.com/push/1', { ...keys, publicKey: 'AAAA' }),
    ).rejects.toThrow(/uncompressed P-256 point/);
  });
});
