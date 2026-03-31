import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    reporters: [
      'default',
      ['@pratya/vitest/reporter', {
        contractPath: '../../CONTRACT.yaml',
        outputDir: './pratya-report',
      }],
    ],
  },
});
