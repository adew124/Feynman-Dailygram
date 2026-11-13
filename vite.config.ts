import { defineConfig } from 'vite';

// Relative base so the build works on GitHub Pages under any repo name.
export default defineConfig({
  base: './',
  test: { include: ['tests/**/*.test.ts'] },
});
