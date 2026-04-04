import { describe, beforeEach, afterEach } from 'vitest';
import { test, expect } from '@intrigsoft/pratya-vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { writeJsonReport, writeHtmlReport } from '../src/report.js';
import type { CoverageMatrix } from '../src/model.js';

function makeSampleMatrix(): CoverageMatrix {
  return {
    moduleId: 'AUTH',
    moduleName: 'Authentication Module',
    generatedAt: '2026-03-31T10:00:00Z',
    specCoverage: 66.7,
    caseCoverage: 50.0,
    passingCaseCoverage: 33.3,
    codeCoverage: 73.2,
    specs: [
      {
        id: 'AUTH-001',
        title: 'User login',
        version: '1.1.0',
        status: 'approved',
        covered: true,
        passing: true,
        tests: [{ title: 'login test', specVersionAtTest: '1.1.0' }],
        cases: [
          { id: 'AUTH-001-CC-001', covered: true, passing: true },
          { id: 'AUTH-001-CC-002', covered: false, passing: null },
        ],
      },
      {
        id: 'AUTH-002',
        title: 'JWT refresh',
        version: '1.0.0',
        status: 'approved',
        covered: true,
        passing: false,
        tests: [{ title: 'refresh test', specVersionAtTest: '1.0.0' }],
        cases: [],
      },
      {
        id: 'AUTH-005',
        title: 'MFA-aware password reset',
        version: '1.0.0',
        status: 'approved',
        covered: false,
        passing: null,
        tests: [],
        cases: [
          { id: 'AUTH-005-CC-001', covered: false, passing: null },
        ],
      },
    ],
    violations: [
      {
        severity: 'ERROR',
        type: 'UNCOVERED_SPEC',
        specId: 'AUTH-005',
        message: "Approved spec 'AUTH-005' has no mapped test",
      },
      {
        severity: 'WARN',
        type: 'UNCOVERED_CASE',
        specId: 'AUTH-001',
        caseId: 'AUTH-001-CC-002',
        message: "Case 'AUTH-001-CC-002' has no mapped test",
      },
    ],
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pratya-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('writeJsonReport', () => {
  test('writes valid JSON with expected shape', ({ spec }) => {
    spec('PRATYA-004');
    const matrix = makeSampleMatrix();
    const outputPath = path.join(tmpDir, 'report', 'pratya-report.json');
    writeJsonReport(matrix, outputPath);

    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(raw.module).toBe('AUTH');
    expect(raw.generatedAt).toBe('2026-03-31T10:00:00Z');
    expect(raw.summary.totalSpecs).toBe(3);
    expect(raw.summary.specCoverage).toBe(66.7);
    expect(raw.summary.passingCaseCoverage).toBe(33.3);
    expect(raw.summary.codeCoverage).toBe(73.2);
    expect(raw.specs).toHaveLength(3);
    expect(raw.violations).toHaveLength(2);
  });

  test('counts active and covered specs correctly', ({ spec }) => {
    spec('PRATYA-004');
    const matrix = makeSampleMatrix();
    const outputPath = path.join(tmpDir, 'pratya-report.json');
    writeJsonReport(matrix, outputPath);

    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(raw.summary.activeSpecs).toBe(3);
    expect(raw.summary.coveredSpecs).toBe(2);
  });
});

describe('writeHtmlReport', () => {
  test('generates an HTML file with key markers', ({ spec }) => {
    spec(['PRATYA-004', 'PRATYA-004-CC-001']);
    const matrix = makeSampleMatrix();
    writeHtmlReport(matrix, tmpDir);

    const html = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf-8');
    expect(html).toContain('Prathya');
    expect(html).toContain('AUTH-001');
    expect(html).toContain('AUTH-002');
    expect(html).toContain('AUTH-005');
    expect(html).toContain('66.7%');
    expect(html).toContain('73.2%');
    expect(html).toContain('Violations');
  });
});
