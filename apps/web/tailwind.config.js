/** Colours and sizes are written as exact values from design/ (DESIGN_LOCK.md), not the Tailwind scale. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'DM Sans Variable'", "'DM Sans'", 'system-ui', 'sans-serif'],
        display: ["'Cormorant Garamond'", 'Georgia', 'serif'],
        script: ["'Pinyon Script'", 'cursive'],
      },
    },
  },
  plugins: [],
};
