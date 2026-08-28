import { CHAT_TICKET_TTL_MS } from '@buddy/shared';

/**
 * Short-lived WebSocket tickets (§4.7).
 *
 * A WebSocket handshake from React Native cannot carry an Authorization header,
 * so the access token cannot be used directly — and putting a 15-minute token in
 * a query string would leak it into logs and history. Instead REST issues a
 * 60-second ticket, scoped to one group and one user, signed with the same
 * secret. Even if it leaks it is useless almost immediately and grants nothing
 * beyond one room.
 */

const encoder = new TextEncoder();

async function hmac(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  // base64url, so the ticket is safe in a query string.
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export interface ChatTicket {
  groupId: string;
  userId: string;
  expiresAt: number;
}

export async function signChatTicket(
  secret: string,
  groupId: string,
  userId: string,
): Promise<{ ticket: string; expiresAt: string }> {
  const expiresAt = Date.now() + CHAT_TICKET_TTL_MS;
  const payload = `${groupId}.${userId}.${expiresAt}`;
  const signature = await hmac(payload, secret);
  return {
    ticket: `${payload}.${signature}`,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

/** Returns the ticket's claims, or null if it is malformed, forged or expired. */
export async function verifyChatTicket(
  secret: string,
  ticket: string,
): Promise<ChatTicket | null> {
  const parts = ticket.split('.');
  if (parts.length !== 4) return null;

  const [groupId, userId, expiresRaw, signature] = parts as [string, string, string, string];
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt)) return null;

  const expected = await hmac(`${groupId}.${userId}.${expiresRaw}`, secret);
  // Constant-time-ish: compare full strings of equal length rather than
  // short-circuiting on the first differing character.
  if (expected.length !== signature.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  if (diff !== 0) return null;

  if (expiresAt <= Date.now()) return null;

  return { groupId, userId, expiresAt };
}
