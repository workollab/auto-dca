/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Workollab palette
        ink: {
          900: '#0a0c12',
          800: '#0f1115',
          700: '#161922',
          600: '#1c212d',
          500: '#2a2f3a',
        },
        line: '#2a2f3a',
        fg: '#e6e8eb',
        muted: '#9aa0ab',
        dim: '#6b7280',
        accent: '#6cb6ff', // blue — forecast
        oil: '#6dd3a3', // green — history / production
        amber: '#f5b454',
        danger: '#ef4444',
        violet: '#a78bfa',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
