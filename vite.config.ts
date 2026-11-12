import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The dependency cache lives in the checkout, not in node_modules: a second checkout (a git
  // worktree with node_modules linked to this one's) running its own dev server would otherwise share
  // the cache and overwrite it — both servers then hand out mismatched copies of React.
  cacheDir: '.vite',
  server: {
    // (other checkouts kept under .claude/worktrees are not this one's sources: edits there must not
    // reload this server's pages)
    watch: { ignored: ['**/.claude/**'] },
    // Pin a dedicated port so the dev URL is predictable. Sibling projects float up
    // from 5173 and collide, so Cambrian gets its own. strictPort makes a conflict
    // fail loudly (e.g. a second `npm run dev`) instead of silently moving the URL.
    // The preview/launch harness can still override with the PORT env var.
    port: Number(process.env.PORT) || 5180,
    strictPort: true,
  },
});
