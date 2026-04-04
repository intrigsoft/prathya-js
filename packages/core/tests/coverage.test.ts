import { describe } from 'vitest';
import { test, expect } from '@intrigsoft/pratya-vitest';
import * as path from 'node:path';
import { parseContract } from '../src/parser.js';
import { computeCoverage } from '../src/coverage.js';
import type { TraceEntry } from '../src/model.js';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');

function loadContract() {
  return parseContract(path.join(FIXTURE_DIR, 'valid-contract.yaml'));
}

describe('computeCoverage', () => {
  test('computes 0% when no traces exist', ({ requirement }) => {
    requirement('PRATYA-002');
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    expect(matrix.requirementCoverage).toBe(0);
    expect(matrix.cornerCaseCoverage).toBe(0);
    expect(matrix.requirements.every(r => r.passing === null)).toBe(true);
  });

  test('excludes deprecated and superseded by default', ({ requirement }) => {
    requirement('PRATYA-002');
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    expect(matrix.requirements).toHaveLength(3);
    expect(matrix.requirements.map(r => r.id).sort()).toEqual(['AUTH-001', 'AUTH-002', 'AUTH-005']);
  });

  test('computes correct percentages with partial coverage', ({ requirement }) => {
    requirement('PRATYA-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      {
        requirementIds: ['AUTH-001'],
        testTitle: 'login test',
        testFile: 'auth.test.ts',
        result: 'passed',
      },
      {
        requirementIds: ['AUTH-001-CC-001'],
        testTitle: 'wrong password test',
        testFile: 'auth.test.ts',
        result: 'passed',
      },
    ];

    const matrix = computeCoverage(contract, traces);
    expect(matrix.requirementCoverage).toBeCloseTo(33.3, 0);
    expect(matrix.cornerCaseCoverage).toBeCloseTo(16.7, 0);
  });

  test('computes 100% when all approved requirements are covered', ({ requirement }) => {
    requirement('PRATYA-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001'], testTitle: 'login', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-002'], testTitle: 'refresh', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005'], testTitle: 'reset', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    expect(matrix.requirementCoverage).toBe(100);
  });

  test('marks passing correctly — all pass = true', ({ requirement }) => {
    requirement('PRATYA-002-CC-001');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001'], testTitle: 'test1', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001'], testTitle: 'test2', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    const auth001 = matrix.requirements.find(r => r.id === 'AUTH-001')!;
    expect(auth001.passing).toBe(true);
    expect(auth001.tests).toHaveLength(2);
  });

  test('marks passing correctly — any fail = false', ({ requirement }) => {
    requirement('PRATYA-002-CC-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001'], testTitle: 'test1', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001'], testTitle: 'test2', testFile: 'a.ts', result: 'failed' },
    ];

    const matrix = computeCoverage(contract, traces);
    const auth001 = matrix.requirements.find(r => r.id === 'AUTH-001')!;
    expect(auth001.passing).toBe(false);
  });

  test('marks passing as null when no tests', ({ requirement }) => {
    requirement('PRATYA-002-CC-003');
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    const auth001 = matrix.requirements.find(r => r.id === 'AUTH-001')!;
    expect(auth001.passing).toBeNull();
  });

  test('reads code coverage from Istanbul summary', ({ requirement }) => {
    requirement('PRATYA-002-CC-004');
    const contract = loadContract();
    const matrix = computeCoverage(contract, [], {
      codeCoverageSummaryPath: path.join(FIXTURE_DIR, 'coverage-summary.json'),
    });
    expect(matrix.codeCoverage).toBe(73.0);
  });

  test('returns undefined codeCoverage when file missing', ({ requirement }) => {
    requirement('PRATYA-002-CC-005');
    const contract = loadContract();
    const matrix = computeCoverage(contract, [], {
      codeCoverageSummaryPath: '/nonexistent/coverage.json',
    });
    expect(matrix.codeCoverage).toBeUndefined();
  });

  test('computes corner case coverage correctly', ({ requirement }) => {
    requirement('PRATYA-002-CC-006');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001-CC-001'], testTitle: 'cc1', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001-CC-002'], testTitle: 'cc2', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001-CC-003'], testTitle: 'cc3', testFile: 'a.ts', result: 'failed' },
      { requirementIds: ['AUTH-002-CC-001'], testTitle: 'cc4', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005-CC-001'], testTitle: 'cc5', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005-CC-002'], testTitle: 'cc6', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    expect(matrix.cornerCaseCoverage).toBe(100);

    const auth001 = matrix.requirements.find(r => r.id === 'AUTH-001')!;
    const cc003 = auth001.cornerCases.find(cc => cc.id === 'AUTH-001-CC-003')!;
    expect(cc003.covered).toBe(true);
    expect(cc003.passing).toBe(false);
  });
});
