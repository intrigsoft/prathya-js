import { test as vitestTest, expect as vitestExpect } from 'vitest';

export declare const test: typeof vitestTest & {
  extend<T extends { requirement: (ids: string | string[]) => void }>(
    fixtures: Record<string, unknown>,
  ): typeof vitestTest;
};

export declare const expect: typeof vitestExpect;
