import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseContract,
  finalizeReport,
  resolveReporterOptions,
} from '@intrigsoft/pratya-core';
import type {
  SpecStatus,
  TraceEntry,
  TestResult,
  IntegrationReporterOptions,
} from '@intrigsoft/pratya-core';

export interface PratyaJestReporterOptions {
  contractPath?: string;
  outputDir?: string;
  failOnViolations?: boolean;
  minimumSpecCoverage?: number;
  excludeStatuses?: SpecStatus[];
  codeCoverage?: { summaryPath: string };
}

// Minimal Jest types to avoid hard dependency on @jest/reporters at runtime
interface JestTestResult {
  fullName: string;
  status: string; // 'passed' | 'failed' | 'pending' | 'skipped'
}

interface JestTestSuiteResult {
  testFilePath: string;
  testResults: JestTestResult[];
}

interface JestAggregatedResult {
  testResults: JestTestSuiteResult[];
}

function toTestResult(status: string): TestResult {
  switch (status) {
    case 'passed': return 'passed';
    case 'failed': return 'failed';
    case 'pending':
    case 'skipped': return 'skipped';
    default: return 'failed';
  }
}

class PratyaJestReporter {
  private options: IntegrationReporterOptions;
  private globalConfig: unknown;

  constructor(globalConfig: unknown, options?: PratyaJestReporterOptions) {
    this.globalConfig = globalConfig;
    this.options = resolveReporterOptions({
      contractPath: options?.contractPath,
      outputDir: options?.outputDir,
      failOnViolations: options?.failOnViolations,
      minimumSpecCoverage: options?.minimumSpecCoverage,
      excludeStatuses: options?.excludeStatuses,
      codeCoverage: options?.codeCoverage,
    });
  }

  onRunComplete(_testContexts: unknown, results: JestAggregatedResult): void {
    const annotationsDir = path.join(process.cwd(), '.pratya-annotations');

    // Read all annotation files
    const allAnnotations = new Map<string, string[]>();
    try {
      if (fs.existsSync(annotationsDir)) {
        const files = fs.readdirSync(annotationsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const content = JSON.parse(fs.readFileSync(path.join(annotationsDir, file), 'utf-8'));
          for (const [testName, ids] of Object.entries(content)) {
            allAnnotations.set(testName, ids as string[]);
          }
        }
        // Clean up annotation files
        for (const file of files) {
          fs.unlinkSync(path.join(annotationsDir, file));
        }
        try { fs.rmdirSync(annotationsDir); } catch { /* not empty or doesn't exist */ }
      }
    } catch {
      // No annotations found
    }

    if (allAnnotations.size === 0) return;

    // Parse contract once for version lookup
    let contract;
    try {
      contract = parseContract(this.options.contractPath);
    } catch {
      // Will be caught again in finalizeReport
    }

    // Build traces by cross-referencing annotations with Jest results
    const traces: TraceEntry[] = [];

    for (const suiteResult of results.testResults) {
      for (const testResult of suiteResult.testResults) {
        const specIds = allAnnotations.get(testResult.fullName);
        if (!specIds || specIds.length === 0) continue;

        let specVersionAtTest: Record<string, string> | undefined;
        if (contract) {
          specVersionAtTest = {};
          for (const id of specIds) {
            const spec = contract.specs.find(r => r.id === id);
            if (spec) {
              specVersionAtTest[id] = spec.version;
            }
          }
        }

        traces.push({
          specIds,
          testTitle: testResult.fullName,
          testFile: suiteResult.testFilePath,
          specVersionAtTest,
          result: toTestResult(testResult.status),
        });
      }
    }

    finalizeReport(traces, this.options);
  }
}

export default PratyaJestReporter;
