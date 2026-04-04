import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseContract } from './parser.js';
import { computeCoverage } from './coverage.js';
import { audit } from './audit.js';
import { COVERAGE_BELOW_THRESHOLD } from './audit.js';
import { writeHtmlReport, writeJsonReport } from './report.js';
import type { TraceEntry, SpecStatus, CoverageMatrix, ModuleContract } from './model.js';

export interface IntegrationReporterOptions {
  contractPath: string;
  outputDir: string;
  failOnViolations: boolean;
  minimumSpecCoverage: number;
  excludeStatuses: SpecStatus[];
  codeCoverage?: { summaryPath: string };
}

export const DEFAULT_REPORTER_OPTIONS: IntegrationReporterOptions = {
  contractPath: './CONTRACT.yaml',
  outputDir: './pratya-report',
  failOnViolations: false,
  minimumSpecCoverage: 0,
  excludeStatuses: ['deprecated', 'superseded'],
};

export function resolveReporterOptions(
  partial?: Partial<IntegrationReporterOptions>,
): IntegrationReporterOptions {
  return {
    ...DEFAULT_REPORTER_OPTIONS,
    ...partial,
    excludeStatuses: partial?.excludeStatuses ?? DEFAULT_REPORTER_OPTIONS.excludeStatuses,
  };
}

/**
 * Shared finalization logic for all Pratya reporter integrations.
 * Parses contract, runs audit, computes coverage, writes reports.
 * Returns the coverage matrix, or undefined if the contract could not be parsed.
 */
export function finalizeReport(
  traces: TraceEntry[],
  options: IntegrationReporterOptions,
): CoverageMatrix | undefined {
  let contract;
  try {
    contract = parseContract(options.contractPath);
  } catch (err) {
    console.error(`[pratya] Failed to parse contract: ${(err as Error).message}`);
    return undefined;
  }

  // Load previous report for version staleness check
  const previousReportPath = path.join(options.outputDir, 'pratya-report.json');
  let previousReport: CoverageMatrix | undefined;
  try {
    if (fs.existsSync(previousReportPath)) {
      const raw = JSON.parse(fs.readFileSync(previousReportPath, 'utf-8'));
      previousReport = {
        moduleId: raw.module,
        moduleName: raw.module,
        generatedAt: raw.generatedAt,
        specCoverage: raw.summary?.specCoverage ?? 0,
        caseCoverage: raw.summary?.caseCoverage ?? 0,
        passingCaseCoverage: raw.summary?.passingCaseCoverage ?? 0,
        codeCoverage: raw.summary?.codeCoverage,
        specs: raw.specs ?? [],
        violations: raw.violations ?? [],
      };
    }
  } catch {
    // No previous report; skip staleness
  }

  // Run audit
  const violations = audit(contract, traces, previousReport);

  // Compute coverage
  const matrix = computeCoverage(contract, traces, {
    excludeStatuses: options.excludeStatuses,
    codeCoverageSummaryPath: options.codeCoverage?.summaryPath,
  });

  // Merge violations into the matrix
  matrix.violations = violations;

  // Check threshold
  if (
    options.minimumSpecCoverage > 0 &&
    matrix.specCoverage < options.minimumSpecCoverage
  ) {
    matrix.violations.push({
      severity: 'ERROR',
      type: COVERAGE_BELOW_THRESHOLD,
      message: `Spec coverage ${matrix.specCoverage}% is below the configured threshold of ${options.minimumSpecCoverage}%`,
    });
  }

  // Write reports
  const jsonPath = path.join(options.outputDir, 'pratya-report.json');
  writeJsonReport(matrix, jsonPath);
  writeHtmlReport(matrix, options.outputDir, contract);

  const errorCount = matrix.violations.filter(v => v.severity === 'ERROR').length;
  const warnCount = matrix.violations.filter(v => v.severity === 'WARN').length;

  console.log(`\n[pratya] Coverage: ${matrix.specCoverage}% specs, ${matrix.caseCoverage}% cases (${matrix.passingCaseCoverage}% passing)`);
  if (matrix.codeCoverage !== undefined) {
    console.log(`[pratya] Code coverage: ${matrix.codeCoverage}%`);
  }
  if (errorCount > 0) console.log(`[pratya] ${errorCount} error(s)`);
  if (warnCount > 0) console.log(`[pratya] ${warnCount} warning(s)`);
  console.log(`[pratya] Report written to ${options.outputDir}/`);

  if (options.failOnViolations && errorCount > 0) {
    process.exitCode = 1;
  }

  return matrix;
}

/**
 * Write trace entries to a JSON file. Used by test runner reporters
 * to persist traces so that `pratya run` can generate the full report
 * after the test process (and coverage) completes.
 */
export function writeTraces(traces: TraceEntry[], outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const tracesPath = path.join(outputDir, 'pratya-traces.json');
  fs.writeFileSync(tracesPath, JSON.stringify(traces, null, 2), 'utf-8');
}

/**
 * Read trace entries written by a test runner reporter.
 */
export function readTraces(outputDir: string): TraceEntry[] {
  const tracesPath = path.join(outputDir, 'pratya-traces.json');
  if (!fs.existsSync(tracesPath)) return [];
  return JSON.parse(fs.readFileSync(tracesPath, 'utf-8')) as TraceEntry[];
}
