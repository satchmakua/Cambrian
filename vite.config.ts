import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Honor a PORT env var (e.g. from the preview/launch harness) so the dev server
  // binds the port the tooling expects; falls back to Vite's default otherwise.
  server: process.env.PORT ? { port: Number(process.env.PORT) } : undefined,
});
