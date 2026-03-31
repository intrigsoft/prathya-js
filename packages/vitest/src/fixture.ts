import { test as base, expect } from 'vitest';

export const test = base.extend<{ requirement: (ids: string | string[]) => void }>({
  requirement: async ({ task }, use) => {
    await use((ids: string | string[]) => {
      const normalized = Array.isArray(ids) ? ids : [ids];
      if (!task.meta.pratya) {
        task.meta.pratya = { requirementIds: [] };
      }
      (task.meta.pratya as { requirementIds: string[] }).requirementIds.push(...normalized);
    });
  },
});

export { expect };
