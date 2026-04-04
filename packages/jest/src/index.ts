/**
 * Call `spec()` inside a Jest test body to link the test to spec IDs.
 *
 * Jest has no built-in annotation mechanism like Playwright's `testInfo.annotations`
 * or Vitest's `task.meta`. Annotations are stored in a global map keyed by test name
 * and flushed to disk by the setup module (`@intrigsoft/pratya-jest/setup`) via `afterEach`.
 */

// Global storage for the current worker process
const annotations = new Map<string, string[]>();

export function spec(ids: string | string[]): void {
  const normalized = Array.isArray(ids) ? ids : [ids];

  // Jest exposes the current test name via expect.getState()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jestExpect = (globalThis as Record<string, unknown>).expect as
    | { getState?: () => { currentTestName?: string } }
    | undefined;
  const testName = jestExpect?.getState?.()?.currentTestName;

  if (!testName) {
    throw new Error('spec() must be called inside a Jest test body');
  }

  const existing = annotations.get(testName) ?? [];
  existing.push(...normalized);
  annotations.set(testName, existing);
}

/** @internal — used by the setup module to read and flush annotations */
export function _getAnnotations(): Map<string, string[]> {
  return annotations;
}

/** @internal — used by the setup module after flushing */
export function _clearAnnotations(): void {
  annotations.clear();
}
