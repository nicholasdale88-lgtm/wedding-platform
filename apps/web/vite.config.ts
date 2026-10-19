import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // `pnpm dev` at the root runs the Worker (wrangler dev, port 8787) alongside this; /api goes to it, so no CORS.
  server: { proxy: { '/api': 'http://localhost:8787' } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
