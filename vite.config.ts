import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Pin a dedicated port so the dev URL is predictable. Sibling projects float up
    // from 5173 and collide, so Cambrian gets its own. strictPort makes a conflict
    // fail loudly (e.g. a second `npm run dev`) instead of silently moving the URL.
    // The preview/launch harness can still override with the PORT env var.
    port: Number(process.env.PORT) || 5180,
    strictPort: true,
  },
});
