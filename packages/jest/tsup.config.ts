import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/reporter.ts', 'src/setup.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['jest', '@jest/reporters', '@jest/types'],
});
