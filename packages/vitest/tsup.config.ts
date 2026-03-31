import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/reporter.ts'],
  format: ['esm', 'cjs'],
  dts: false,
  clean: true,
  sourcemap: true,
  external: ['vitest'],
});
