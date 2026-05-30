import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// All graphics/audio are procedural (no external assets), so the production
// build can be inlined into a single self-contained index.html that runs by
// double-clicking — ideal for offline play and easy sharing.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2022',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});
