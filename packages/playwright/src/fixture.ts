import { test as base } from '@playwright/test';

export const test = base.extend<{ requirement: (ids: string | string[]) => void }>({
  requirement: [async ({}, use, testInfo) => {
    await use((ids: string | string[]) => {
      const normalized = Array.isArray(ids) ? ids : [ids];
      normalized.forEach(id => {
        testInfo.annotations.push({ type: 'requirement', description: id });
        testInfo.tags.push(`@requirement:${id}`);
      });
    });
  }, { auto: false }],
});

export { expect } from '@playwright/test';
