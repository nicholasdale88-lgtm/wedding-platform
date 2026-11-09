/** Colours and sizes are written as exact values from design/ (DESIGN_LOCK.md), not the Tailwind scale. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Hover styles only on devices with a real pointer: on iPhone a hover style can make the first tap just
  // "hover" and need a second tap to act.
  future: { hoverOnlyWhenSupported: true },
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
