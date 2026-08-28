import type { Metadata, Viewport } from 'next';

import { Providers } from './providers';

import './globals.css';

export const metadata: Metadata = {
  title: 'Buddy',
  description: "Accountability buddies. Plan what you'll finish today, have a buddy approve it.",
  applicationName: 'Buddy',
  /**
   * Not for the install banner — for notifications. Safari grants Web Push only
   * to a site that has been added to the Home Screen and declares
   * `display: standalone`, so on iOS this manifest is the difference between
   * push working and `subscribe()` rejecting. Every other browser subscribes
   * without any of this.
   */
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
};

/**
 * The API is on a different origin, so the first request to it pays DNS, TCP and
 * TLS before it can even start — and that request is on the critical path, since
 * nothing renders until `/me` resolves. Preconnecting overlaps that handshake
 * with the JS download instead of queueing behind it, which is worth roughly
 * 100-200ms on a mobile connection.
 *
 * `crossOrigin` is required rather than decorative: the app's calls to this
 * origin are CORS requests (they carry an `Authorization` header), and a socket
 * opened without it cannot be reused for one.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href={API_URL} crossOrigin="anonymous" />
        <link rel="dns-prefetch" href={API_URL} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
