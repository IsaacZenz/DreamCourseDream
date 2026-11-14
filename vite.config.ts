import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths so the build works at https://<user>.github.io/<repo>/
  base: './',
  build: {
    target: 'es2022',
    // Phaser alone is over Vite's default 500 kB warning size.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
