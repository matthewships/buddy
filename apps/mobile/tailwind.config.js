/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // The one place the palette is defined; components use these names
        // rather than raw hex values.
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
