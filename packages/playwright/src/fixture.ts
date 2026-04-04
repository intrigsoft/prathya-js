import { test as base } from '@playwright/test';

export const test = base.extend<{ spec: (ids: string | string[]) => void }>({
  spec: [async ({}, use, testInfo) => {
    await use((ids: string | string[]) => {
      const normalized = Array.isArray(ids) ? ids : [ids];
      normalized.forEach(id => {
        testInfo.annotations.push({ type: 'spec', description: id });
        testInfo.tags.push(`@spec:${id}`);
      });
    });
  }, { auto: false }],
});

export { expect } from '@playwright/test';
