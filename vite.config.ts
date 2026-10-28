import { defineConfig } from 'vitest/config';

// Relative base so the build works under https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'] },
});
