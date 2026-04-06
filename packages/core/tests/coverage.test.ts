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
  test('computes 0% when no traces exist', ({ spec }) => {
    spec('PRATYA-002');
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    expect(matrix.specCoverage).toBe(0);
    expect(matrix.caseCoverage).toBe(0);
    expect(matrix.passingCaseCoverage).toBe(0);
    expect(matrix.specs.every(s => s.passing === null)).toBe(true);
  });

  test('excludes deprecated and superseded by default', ({ spec }) => {
    spec('PRATYA-002');
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    expect(matrix.specs).toHaveLength(3);
    expect(matrix.specs.map(s => s.id).sort()).toEqual(['AUTH-001', 'AUTH-002', 'AUTH-005']);
  });

  test('computes correct percentages with partial coverage', ({ spec }) => {
    spec('PRATYA-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      {
        specIds: ['AUTH-001'],
        testTitle: 'login test',
        testFile: 'auth.test.ts',
        result: 'passed',
      },
      {
        specIds: ['AUTH-001-TC-001'],
        testTitle: 'wrong password test',
        testFile: 'auth.test.ts',
        result: 'passed',
      },
    ];

    const matrix = computeCoverage(contract, traces);
    expect(matrix.specCoverage).toBeCloseTo(33.3, 0);
    expect(matrix.caseCoverage).toBeCloseTo(16.7, 0);
    expect(matrix.passingCaseCoverage).toBeCloseTo(16.7, 0);
  });

  test('computes 100% when all approved specs are covered', ({ spec }) => {
    spec('PRATYA-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { specIds: ['AUTH-001'], testTitle: 'login', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-002'], testTitle: 'refresh', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-005'], testTitle: 'reset', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    expect(matrix.specCoverage).toBe(100);
  });

  test('marks passing correctly — all pass = true', ({ spec }) => {
    spec('PRATYA-002-TC-001');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { specIds: ['AUTH-001'], testTitle: 'test1', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-001'], testTitle: 'test2', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    const auth001 = matrix.specs.find(s => s.id === 'AUTH-001')!;
    expect(auth001.passing).toBe(true);
    expect(auth001.tests).toHaveLength(2);
  });

  test('marks passing correctly — any fail = false', ({ spec }) => {
    spec('PRATYA-002-TC-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { specIds: ['AUTH-001'], testTitle: 'test1', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-001'], testTitle: 'test2', testFile: 'a.ts', result: 'failed' },
    ];

    const matrix = computeCoverage(contract, traces);
    const auth001 = matrix.specs.find(s => s.id === 'AUTH-001')!;
    expect(auth001.passing).toBe(false);
  });

  test('marks passing as null when no tests', ({ spec }) => {
    spec('PRATYA-002-TC-003');
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    const auth001 = matrix.specs.find(s => s.id === 'AUTH-001')!;
    expect(auth001.passing).toBeNull();
  });

  test('passingCaseCoverage differs from caseCoverage when cases have failures', ({ spec }) => {
    spec('PRATYA-002-TC-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { specIds: ['AUTH-001-TC-001'], testTitle: 'cc1', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-001-TC-002'], testTitle: 'cc2', testFile: 'a.ts', result: 'failed' },
      { specIds: ['AUTH-001-TC-003'], testTitle: 'cc3', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    // 3/6 cases have linked tests
    expect(matrix.caseCoverage).toBe(50);
    // 2/6 cases have all-passing tests (AUTH-001-TC-002 is failing)
    expect(matrix.passingCaseCoverage).toBeCloseTo(33.3, 0);
  });

  test('reads code coverage from Istanbul summary', ({ spec }) => {
    spec('PRATYA-002-TC-004');
    const contract = loadContract();
    const matrix = computeCoverage(contract, [], {
      codeCoverageSummaryPath: path.join(FIXTURE_DIR, 'coverage-summary.json'),
    });
    expect(matrix.codeCoverage).toBe(73.0);
  });

  test('returns undefined codeCoverage when file missing', ({ spec }) => {
    spec('PRATYA-002-TC-005');
    const contract = loadContract();
    const matrix = computeCoverage(contract, [], {
      codeCoverageSummaryPath: '/nonexistent/coverage.json',
    });
    expect(matrix.codeCoverage).toBeUndefined();
  });

  test('computes case coverage correctly', ({ spec }) => {
    spec('PRATYA-002-TC-006');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { specIds: ['AUTH-001-TC-001'], testTitle: 'cc1', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-001-TC-002'], testTitle: 'cc2', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-001-TC-003'], testTitle: 'cc3', testFile: 'a.ts', result: 'failed' },
      { specIds: ['AUTH-002-TC-001'], testTitle: 'cc4', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-005-TC-001'], testTitle: 'cc5', testFile: 'a.ts', result: 'passed' },
      { specIds: ['AUTH-005-TC-002'], testTitle: 'cc6', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    // All 6 cases have linked tests
    expect(matrix.caseCoverage).toBe(100);
    // 5/6 pass (AUTH-001-TC-003 fails)
    expect(matrix.passingCaseCoverage).toBeCloseTo(83.3, 0);

    const auth001 = matrix.specs.find(s => s.id === 'AUTH-001')!;
    const cc003 = auth001.cases.find(c => c.id === 'AUTH-001-TC-003')!;
    expect(cc003.covered).toBe(true);
    expect(cc003.passing).toBe(false);
  });
});
