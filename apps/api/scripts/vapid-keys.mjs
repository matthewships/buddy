/**
 * Generates a VAPID keypair for Web Push (§4.6).
 *
 *   node scripts/vapid-keys.mjs
 *
 * Standalone on purpose: it uses the same WebCrypto the Worker uses, through
 * Node's own implementation, so it needs no build step and no dependency. The
 * two values it prints go in as secrets:
 *
 *   npx wrangler secret put VAPID_PUBLIC_KEY
 *   npx wrangler secret put VAPID_PRIVATE_KEY
 *
 * Rotating them invalidates every existing browser subscription — each one is
 * bound to the key it was created with — so everyone has to re-enable
 * notifications in Profile. Treat it like rotating JWT_SECRET.
 */

const base64url = (bytes) =>
  Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

// The public key goes to browsers as the uncompressed point they subscribe
// with; the private key is the raw scalar out of the JWK.
const publicKey = base64url(await crypto.subtle.exportKey('raw', pair.publicKey));
const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${d}`);
