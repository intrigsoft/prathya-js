import { test as base, expect } from 'vitest';

export const test = base.extend<{ spec: (ids: string | string[]) => void }>({
  spec: async ({ task }, use) => {
    await use((ids: string | string[]) => {
      const normalized = Array.isArray(ids) ? ids : [ids];
      if (!task.meta.pratya) {
        task.meta.pratya = { specIds: [] };
      }
      (task.meta.pratya as { specIds: string[] }).specIds.push(...normalized);
    });
  },
});

export { expect };
