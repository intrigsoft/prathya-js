import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Reporter,
  TestCase,
  TestResult as PlaywrightTestResult,
  FullResult,
} from '@playwright/test/reporter';
import {
  parseContract,
  computeCoverage,
  audit,
  writeHtmlReport,
  writeJsonReport,
  COVERAGE_BELOW_THRESHOLD,
} from '@pratya/core';
import type {
  RequirementStatus,
  TraceEntry,
  TestResult,
  CoverageMatrix,
} from '@pratya/core';

export interface PratyaReporterOptions {
  contractPath?: string;
  outputDir?: string;
  failOnViolations?: boolean;
  minimumRequirementCoverage?: number;
  excludeStatuses?: RequirementStatus[];
  codeCoverage?: { summaryPath: string };
}

function toTestResult(status: string): TestResult {
  switch (status) {
    case 'passed': return 'passed';
    case 'failed':
    case 'timedOut':
    case 'interrupted': return 'failed';
    case 'skipped': return 'skipped';
    default: return 'failed';
  }
}

class PratyaReporter implements Reporter {
  private options: Required<Omit<PratyaReporterOptions, 'codeCoverage' | 'excludeStatuses'>> & {
    excludeStatuses: RequirementStatus[];
    codeCoverage?: { summaryPath: string };
  };
  private traces: TraceEntry[] = [];

  constructor(options?: PratyaReporterOptions) {
    this.options = {
      contractPath: options?.contractPath ?? './CONTRACT.yaml',
      outputDir: options?.outputDir ?? './pratya-report',
      failOnViolations: options?.failOnViolations ?? false,
      minimumRequirementCoverage: options?.minimumRequirementCoverage ?? 0,
      excludeStatuses: options?.excludeStatuses ?? ['deprecated', 'superseded'],
      codeCoverage: options?.codeCoverage,
    };
  }

  onTestEnd(test: TestCase, result: PlaywrightTestResult): void {
    const reqAnnotations = test.annotations.filter(a => a.type === 'requirement');
    if (reqAnnotations.length === 0) return;

    const requirementIds = reqAnnotations
      .map(a => a.description)
      .filter((d): d is string => typeof d === 'string');

    if (requirementIds.length === 0) return;

    // Read current contract versions for each referenced ID
    let requirementVersionAtTest: Record<string, string> | undefined;
    try {
      const contract = parseContract(this.options.contractPath);
      requirementVersionAtTest = {};
      for (const id of requirementIds) {
        const req = contract.requirements.find(r => r.id === id);
        if (req) {
          requirementVersionAtTest[id] = req.version;
        }
      }
    } catch {
      // Contract not parseable at this stage; versions won't be recorded
    }

    this.traces.push({
      requirementIds,
      testTitle: test.title,
      testFile: test.location.file,
      requirementVersionAtTest,
      result: toTestResult(result.status),
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    let contract;
    try {
      contract = parseContract(this.options.contractPath);
    } catch (err) {
      console.error(`[pratya] Failed to parse contract: ${(err as Error).message}`);
      return;
    }

    // Load previous report for version staleness check
    const previousReportPath = path.join(this.options.outputDir, 'pratya-report.json');
    let previousReport: CoverageMatrix | undefined;
    try {
      if (fs.existsSync(previousReportPath)) {
        const raw = JSON.parse(fs.readFileSync(previousReportPath, 'utf-8'));
        // The JSON report has a different shape — extract the matrix fields
        previousReport = {
          moduleId: raw.module,
          moduleName: raw.module,
          generatedAt: raw.generatedAt,
          requirementCoverage: raw.summary?.requirementCoverage ?? 0,
          cornerCaseCoverage: raw.summary?.cornerCaseCoverage ?? 0,
          codeCoverage: raw.summary?.codeCoverage,
          requirements: raw.requirements ?? [],
          violations: raw.violations ?? [],
        };
      }
    } catch {
      // No previous report; skip staleness
    }

    // Run audit
    const violations = audit(contract, this.traces, previousReport);

    // Compute coverage
    const matrix = computeCoverage(contract, this.traces, {
      excludeStatuses: this.options.excludeStatuses,
      codeCoverageSummaryPath: this.options.codeCoverage?.summaryPath,
    });

    // Merge violations into the matrix
    matrix.violations = violations;

    // Check threshold
    if (
      this.options.minimumRequirementCoverage > 0 &&
      matrix.requirementCoverage < this.options.minimumRequirementCoverage
    ) {
      matrix.violations.push({
        severity: 'ERROR',
        type: COVERAGE_BELOW_THRESHOLD,
        message: `Requirement coverage ${matrix.requirementCoverage}% is below the configured threshold of ${this.options.minimumRequirementCoverage}%`,
      });
    }

    // Write reports
    const jsonPath = path.join(this.options.outputDir, 'pratya-report.json');
    writeJsonReport(matrix, jsonPath);
    writeHtmlReport(matrix, this.options.outputDir);

    const errorCount = matrix.violations.filter(v => v.severity === 'ERROR').length;
    const warnCount = matrix.violations.filter(v => v.severity === 'WARN').length;

    console.log(`\n[pratya] Coverage: ${matrix.requirementCoverage}% requirements, ${matrix.cornerCaseCoverage}% corner cases`);
    if (matrix.codeCoverage !== undefined) {
      console.log(`[pratya] Code coverage: ${matrix.codeCoverage}%`);
    }
    if (errorCount > 0) console.log(`[pratya] ${errorCount} error(s)`);
    if (warnCount > 0) console.log(`[pratya] ${warnCount} warning(s)`);
    console.log(`[pratya] Report written to ${this.options.outputDir}/`);

    if (this.options.failOnViolations && errorCount > 0) {
      process.exitCode = 1;
    }
  }
}

export default PratyaReporter;
