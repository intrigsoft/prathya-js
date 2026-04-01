import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['json-summary'],
      reportsDirectory: './coverage',
    },
    reporters: [
      'default',
      ['@pratya/vitest/reporter', {
        contractPath: '../../CONTRACT.yaml',
        outputDir: './pratya-report',
      }],
    ],
  },
});
