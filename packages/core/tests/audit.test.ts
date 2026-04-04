import { describe } from 'vitest';
import { test, expect } from '@intrigsoft/pratya-vitest';
import * as path from 'node:path';
import { parseContract } from '../src/parser.js';
import { audit, ORPHAN_ANNOTATION, UNCOVERED_REQUIREMENT, UNCOVERED_CORNER_CASE, DEPRECATED_REFERENCE, SUPERSEDED_REFERENCE, BROKEN_SUPERSESSION, STALE_REQUIREMENT_VERSION } from '../src/audit.js';
import type { TraceEntry, CoverageMatrix } from '../src/model.js';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');

function loadContract() {
  return parseContract(path.join(FIXTURE_DIR, 'valid-contract.yaml'));
}

describe('audit', () => {
  test('emits ORPHAN_ANNOTATION for unknown IDs', ({ requirement }) => {
    requirement('PRATYA-003');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-999'], testTitle: 'orphan test', testFile: 'a.ts', result: 'passed' },
    ];

    const violations = audit(contract, traces);
    const orphan = violations.find(v => v.type === ORPHAN_ANNOTATION);
    expect(orphan).toBeDefined();
    expect(orphan!.severity).toBe('ERROR');
    expect(orphan!.message).toContain('AUTH-999');
  });

  test('emits UNCOVERED_REQUIREMENT for approved requirements with no tests', ({ requirement }) => {
    requirement('PRATYA-003');
    const contract = loadContract();
    const violations = audit(contract, []);
    const uncovered = violations.filter(v => v.type === UNCOVERED_REQUIREMENT);
    expect(uncovered).toHaveLength(3);
    expect(uncovered.every(v => v.severity === 'ERROR')).toBe(true);
  });

  test('emits UNCOVERED_CORNER_CASE for approved corner cases with no tests', ({ requirement }) => {
    requirement('PRATYA-003');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001'], testTitle: 'login', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-002'], testTitle: 'refresh', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005'], testTitle: 'reset', testFile: 'a.ts', result: 'passed' },
    ];

    const violations = audit(contract, traces);
    const uncoveredCC = violations.filter(v => v.type === UNCOVERED_CORNER_CASE);
    expect(uncoveredCC).toHaveLength(6);
    expect(uncoveredCC.every(v => v.severity === 'WARN')).toBe(true);
  });

  test('emits DEPRECATED_REFERENCE when referencing deprecated requirement', ({ requirement }) => {
    requirement('PRATYA-003-CC-001');
    const contract = loadContract();
    const modifiedContract = {
      ...contract,
      requirements: contract.requirements.map(r =>
        r.id === 'AUTH-003' ? { ...r, status: 'deprecated' as const } : r,
      ),
    };

    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-003'], testTitle: 'old test', testFile: 'a.ts', result: 'passed' },
    ];

    const violations = audit(modifiedContract, traces);
    const deprecated = violations.find(v => v.type === DEPRECATED_REFERENCE);
    expect(deprecated).toBeDefined();
    expect(deprecated!.severity).toBe('WARN');
  });

  test('emits SUPERSEDED_REFERENCE when referencing superseded requirement', ({ requirement }) => {
    requirement('PRATYA-003-CC-002');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-003'], testTitle: 'old test', testFile: 'a.ts', result: 'passed' },
    ];

    const violations = audit(contract, traces);
    const superseded = violations.find(v => v.type === SUPERSEDED_REFERENCE);
    expect(superseded).toBeDefined();
    expect(superseded!.severity).toBe('WARN');
    expect(superseded!.message).toContain('AUTH-005');
  });

  test('emits BROKEN_SUPERSESSION for non-existent superseded_by target', ({ requirement }) => {
    requirement('PRATYA-003-CC-003');
    const contract = {
      ...loadContract(),
      requirements: [
        {
          id: 'AUTH-001',
          version: '1.0.0',
          status: 'superseded' as const,
          supersededBy: 'AUTH-999',
          title: 'Test',
          description: 'Test',
          acceptanceCriteria: [],
          cornerCases: [],
          changelog: [],
        },
      ],
    };

    const violations = audit(contract, []);
    const broken = violations.find(v => v.type === BROKEN_SUPERSESSION);
    expect(broken).toBeDefined();
    expect(broken!.severity).toBe('ERROR');
    expect(broken!.message).toContain('AUTH-999');
  });

  test('emits STALE_REQUIREMENT_VERSION from previous report', ({ requirement }) => {
    requirement('PRATYA-003-CC-004');
    const contract = loadContract();
    const previousReport: CoverageMatrix = {
      moduleId: 'AUTH',
      moduleName: 'Auth',
      generatedAt: '2026-01-01',
      requirementCoverage: 100,
      cornerCaseCoverage: 100,
      requirements: [
        {
          id: 'AUTH-001',
          title: 'Login',
          version: '1.0.0',
          status: 'approved',
          covered: true,
          passing: true,
          tests: [{ title: 'login test', requirementVersionAtTest: '1.0.0' }],
          cornerCases: [],
        },
      ],
      violations: [],
    };

    const violations = audit(contract, [], previousReport);
    const stale = violations.find(v => v.type === STALE_REQUIREMENT_VERSION);
    expect(stale).toBeDefined();
    expect(stale!.severity).toBe('WARN');
    expect(stale!.message).toContain('v1.0.0');
    expect(stale!.message).toContain('v1.1.0');
  });

  test('does not emit false positives when everything is properly covered', ({ requirement }) => {
    requirement('PRATYA-003-CC-005');
    const contract = loadContract();
    const traces: TraceEntry[] = [
      { requirementIds: ['AUTH-001'], testTitle: 'login', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001-CC-001'], testTitle: 'cc1', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001-CC-002'], testTitle: 'cc2', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-001-CC-003'], testTitle: 'cc3', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-002'], testTitle: 'refresh', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-002-CC-001'], testTitle: 'cc4', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005'], testTitle: 'reset', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005-CC-001'], testTitle: 'cc5', testFile: 'a.ts', result: 'passed' },
      { requirementIds: ['AUTH-005-CC-002'], testTitle: 'cc6', testFile: 'a.ts', result: 'passed' },
    ];

    const violations = audit(contract, traces);
    const errors = violations.filter(v => v.severity === 'ERROR');
    expect(errors).toHaveLength(0);
    expect(violations).toHaveLength(0);
  });
});
