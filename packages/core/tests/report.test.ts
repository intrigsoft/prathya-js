import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
    requirementCoverage: 66.7,
    cornerCaseCoverage: 50.0,
    codeCoverage: 73.2,
    requirements: [
      {
        id: 'AUTH-001',
        title: 'User login',
        version: '1.1.0',
        status: 'approved',
        covered: true,
        passing: true,
        tests: [{ title: 'login test', requirementVersionAtTest: '1.1.0' }],
        cornerCases: [
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
        tests: [{ title: 'refresh test', requirementVersionAtTest: '1.0.0' }],
        cornerCases: [],
      },
      {
        id: 'AUTH-005',
        title: 'MFA-aware password reset',
        version: '1.0.0',
        status: 'approved',
        covered: false,
        passing: null,
        tests: [],
        cornerCases: [
          { id: 'AUTH-005-CC-001', covered: false, passing: null },
        ],
      },
    ],
    violations: [
      {
        severity: 'ERROR',
        type: 'UNCOVERED_REQUIREMENT',
        requirementId: 'AUTH-005',
        message: "Approved requirement 'AUTH-005' has no mapped test",
      },
      {
        severity: 'WARN',
        type: 'UNCOVERED_CORNER_CASE',
        requirementId: 'AUTH-001',
        cornerCaseId: 'AUTH-001-CC-002',
        message: "Corner case 'AUTH-001-CC-002' has no mapped test",
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
  it('writes valid JSON with expected shape', () => {
    const matrix = makeSampleMatrix();
    const outputPath = path.join(tmpDir, 'report', 'pratya-report.json');
    writeJsonReport(matrix, outputPath);

    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(raw.module).toBe('AUTH');
    expect(raw.generatedAt).toBe('2026-03-31T10:00:00Z');
    expect(raw.summary.totalRequirements).toBe(3);
    expect(raw.summary.requirementCoverage).toBe(66.7);
    expect(raw.summary.codeCoverage).toBe(73.2);
    expect(raw.requirements).toHaveLength(3);
    expect(raw.violations).toHaveLength(2);
  });

  it('counts active and covered requirements correctly', () => {
    const matrix = makeSampleMatrix();
    const outputPath = path.join(tmpDir, 'pratya-report.json');
    writeJsonReport(matrix, outputPath);

    const raw = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    expect(raw.summary.activeRequirements).toBe(3);
    expect(raw.summary.coveredRequirements).toBe(2);
  });
});

describe('writeHtmlReport', () => {
  it('generates an HTML file with key markers', () => {
    const matrix = makeSampleMatrix();
    writeHtmlReport(matrix, tmpDir);

    const html = fs.readFileSync(path.join(tmpDir, 'index.html'), 'utf-8');
    expect(html).toContain('Pratya Coverage Report');
    expect(html).toContain('AUTH-001');
    expect(html).toContain('AUTH-002');
    expect(html).toContain('AUTH-005');
    expect(html).toContain('66.7%');
    expect(html).toContain('73.2%');
    expect(html).toContain('Errors');
    expect(html).toContain('Warnings');
  });
});
