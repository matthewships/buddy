/**
 * The web palette.
 *
 * **Diverged from apps/mobile/tailwind.config.js on 2026-09-03.** The two files
 * were byte-identical so the clients could not drift; the web client now has
 * its own creative direction (ARCHITECTURE.md §5.8), derived from a seed string
 * that is recorded there with the script that produced it. The token *names*
 * are unchanged on purpose — `brand`, `surface`, `ink`, `success` — so every
 * screen restyles through the values alone and the mobile app, which reads the
 * same names from its own file, is untouched.
 *
 * Deliberately without `nativewind/preset`: that preset rewrites the utilities
 * for React Native's style objects, which is wrong for real CSS.
 *
 * Roles, from the seed's five colours (§5.8):
 * - `brand`   deep olive — text, links, active states, progress. Deepened from
 *             the seed's #70821e until it clears 4.5:1 on cream (it is 6.2:1).
 * - `accent`  the seed's lime #a8cf4b — primary buttons, with *ink* on it
 *             (9.8:1); white on lime is 1.8:1 and unreadable.
 * - `live`    the seed's green #0fb73a — only for things that are actually
 *             happening: a running clock, an active-now dot. Never text.
 * - `people`  the seed's periwinkle #ced1fe — avatars without a photo, and
 *             anything that is about another person rather than the work.
 * - `success` a darker green than `live`, because it is used as text.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#55661a',
          fg: '#ffffff',
          muted: '#e3f1d6',
        },
        accent: {
          DEFAULT: '#a8cf4b',
          fg: '#161b0e',
          muted: '#eef6d3',
        },
        live: '#0fb73a',
        people: {
          DEFAULT: '#ced1fe',
          fg: '#161b0e',
        },
        surface: {
          DEFAULT: '#fcfcf7',
          muted: '#f3f4ea',
          border: '#dde2cc',
        },
        ink: {
          DEFAULT: '#161b0e',
          muted: '#5b6350',
          subtle: '#7f8772',
        },
        success: '#15803d',
        warning: '#b45309',
        danger: '#b91c1c',
      },
      fontFamily: {
        // Set on <html> by next/font in app/layout.tsx. Fallbacks are real
        // fonts, not `sans-serif`, so a blocked font file still lays out close
        // to the intended metrics.
        sans: ['var(--font-body)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      letterSpacing: {
        // The eyebrow: small caps, spaced. The seed is 45 upper to 39 lower
        // case, and the direction leans on uppercase labels for structure.
        eyebrow: '0.14em',
      },
    },
  },
  plugins: [],
};
