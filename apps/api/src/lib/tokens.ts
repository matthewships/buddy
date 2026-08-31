/**
 * Random tokens for join links (§2.3).
 *
 * Not a ULID: ids in this codebase are ULIDs precisely so they sort by creation
 * time, and that same property makes them guessable — knowing one link's token
 * would narrow the search for another minted nearby. A join link is a bearer
 * capability, so it has to be drawn from a space nobody can walk.
 *
 * 32 bytes of CSPRNG output, base64url so it survives a URL, a QR code and a
 * WhatsApp message without escaping.
 */
export function newInviteToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
