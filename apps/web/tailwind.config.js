/**
 * The web palette, kept byte-identical to apps/mobile/tailwind.config.js so the
 * two clients cannot drift apart visually. Deliberately without
 * `nativewind/preset`: that preset rewrites the utilities for React Native's
 * style objects, which is wrong for real CSS.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#4f46e5',
          fg: '#ffffff',
          muted: '#eef2ff',
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f8fafc',
          border: '#e2e8f0',
        },
        ink: {
          DEFAULT: '#0f172a',
          muted: '#64748b',
          subtle: '#94a3b8',
        },
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
      },
    },
  },
  plugins: [],
};
