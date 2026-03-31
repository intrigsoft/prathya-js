import * as fs from 'node:fs';
import * as path from 'node:path';
import { _getAnnotations, _clearAnnotations } from './index.js';

/**
 * Jest setupFilesAfterFramework module.
 *
 * Installs an afterEach hook that flushes requirement annotations from the
 * in-memory map to a JSON file on disk. The reporter reads these files in
 * onRunComplete to build TraceEntry[].
 *
 * The file path is deterministic per test file (base64url of the test path)
 * so that parallel workers don't collide.
 */

const ANNOTATIONS_DIR = path.join(process.cwd(), '.pratya-annotations');

// Ensure output directory exists
fs.mkdirSync(ANNOTATIONS_DIR, { recursive: true });

// Determine the current test file path from Jest globals
const testFile = (globalThis as { __filename?: string }).__filename ?? 'unknown';
const safeFilename = Buffer.from(testFile).toString('base64url') + '.json';
const annotationsPath = path.join(ANNOTATIONS_DIR, safeFilename);

// Initialize the file
fs.writeFileSync(annotationsPath, '{}', 'utf-8');

const jestAfterEach = (globalThis as Record<string, unknown>).afterEach as
  | ((fn: () => void) => void)
  | undefined;

if (!jestAfterEach) {
  throw new Error('@pratya/jest/setup must be loaded as a Jest setupFilesAfterFramework entry');
}

jestAfterEach(() => {
  const annotations = _getAnnotations();
  if (annotations.size === 0) return;

  // Read existing entries (from prior tests in this file)
  let existing: Record<string, string[]> = {};
  try {
    existing = JSON.parse(fs.readFileSync(annotationsPath, 'utf-8'));
  } catch {
    // Fresh file
  }

  // Merge current annotations
  for (const [testName, ids] of annotations) {
    existing[testName] = [...(existing[testName] ?? []), ...ids];
  }

  fs.writeFileSync(annotationsPath, JSON.stringify(existing), 'utf-8');
  _clearAnnotations();
});
