import { defineConfig } from 'vite';

// Relative base: the build works from any sub-path (GitHub Pages serves it at /<repo>/).
export default defineConfig({
  base: './',
});
