import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { parseContract } from '../src/parser.js';
import { computeCoverage } from '../src/coverage.js';
import type { TraceEntry } from '../src/model.js';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');

function loadContract() {
  return parseContract(path.join(FIXTURE_DIR, 'valid-contract.yaml'));
}

describe('computeCoverage', () => {
  it('computes 0% when no traces exist', () => {
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    expect(matrix.requirementCoverage).toBe(0);
    expect(matrix.cornerCaseCoverage).toBe(0);
    expect(matrix.requirements.every(r => r.passing === null)).toBe(true);
  });

  it('excludes deprecated and superseded by default', () => {
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    // AUTH-003 is superseded, so only AUTH-001, AUTH-002, AUTH-005 are active
    expect(matrix.requirements).toHaveLength(3);
    expect(matrix.requirements.map(r => r.id).sort()).toEqual(['AUTH-001', 'AUTH-002', 'AUTH-005']);
  });

  it('computes correct percentages with partial coverage', () => {
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
    // 1 of 3 approved requirements covered
    expect(matrix.requirementCoverage).toBeCloseTo(33.3, 0);
    // AUTH-001 has 3 CCs, AUTH-002 has 1 CC, AUTH-005 has 2 CCs = 6 total, 1 covered
    expect(matrix.cornerCaseCoverage).toBeCloseTo(16.7, 0);
  });

  it('computes 100% when all approved requirements are covered', () => {
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001'], testTitle: 'login', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-002'], testTitle: 'refresh', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005'], testTitle: 'reset', testFile: 'a.ts', result: 'passed' },
    ];

    const matrix = computeCoverage(contract, traces);
    expect(matrix.requirementCoverage).toBe(100);
  });

  it('marks passing correctly — all pass = true', () => {
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

  it('marks passing correctly — any fail = false', () => {
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001'], testTitle: 'test1', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001'], testTitle: 'test2', testFile: 'a.ts', result: 'failed' },
    ];

    const matrix = computeCoverage(contract, traces);
    const auth001 = matrix.requirements.find(r => r.id === 'AUTH-001')!;
    expect(auth001.passing).toBe(false);
  });

  it('marks passing as null when no tests', () => {
    const contract = loadContract();
    const matrix = computeCoverage(contract, []);
    const auth001 = matrix.requirements.find(r => r.id === 'AUTH-001')!;
    expect(auth001.passing).toBeNull();
  });

  it('reads code coverage from Istanbul summary', () => {
    const contract = loadContract();
    const matrix = computeCoverage(contract, [], {
      codeCoverageSummaryPath: path.join(FIXTURE_DIR, 'coverage-summary.json'),
    });
    expect(matrix.codeCoverage).toBe(73.0);
  });

  it('returns undefined codeCoverage when file missing', () => {
    const contract = loadContract();
    const matrix = computeCoverage(contract, [], {
      codeCoverageSummaryPath: '/nonexistent/coverage.json',
    });
    expect(matrix.codeCoverage).toBeUndefined();
  });

  it('computes corner case coverage correctly', () => {
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
