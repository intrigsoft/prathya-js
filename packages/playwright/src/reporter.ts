import type {
  Reporter,
  TestCase,
  TestResult as PlaywrightTestResult,
  FullResult,
} from '@playwright/test/reporter';
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

export interface PratyaReporterOptions {
  contractPath?: string;
  outputDir?: string;
  failOnViolations?: boolean;
  minimumSpecCoverage?: number;
  excludeStatuses?: SpecStatus[];
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
  private options: IntegrationReporterOptions;
  private traces: TraceEntry[] = [];

  constructor(options?: PratyaReporterOptions) {
    this.options = resolveReporterOptions({
      contractPath: options?.contractPath,
      outputDir: options?.outputDir,
      failOnViolations: options?.failOnViolations,
      minimumSpecCoverage: options?.minimumSpecCoverage,
      excludeStatuses: options?.excludeStatuses,
      codeCoverage: options?.codeCoverage,
    });
  }

  onTestEnd(test: TestCase, result: PlaywrightTestResult): void {
    const specAnnotations = test.annotations.filter(a => a.type === 'spec');
    if (specAnnotations.length === 0) return;

    const specIds = specAnnotations
      .map(a => a.description)
      .filter((d): d is string => typeof d === 'string');

    if (specIds.length === 0) return;

    let specVersionAtTest: Record<string, string> | undefined;
    try {
      const contract = parseContract(this.options.contractPath);
      specVersionAtTest = {};
      for (const id of specIds) {
        const spec = contract.specs.find(r => r.id === id);
        if (spec) {
          specVersionAtTest[id] = spec.version;
        }
      }
    } catch {
      // Contract not parseable at this stage
    }

    this.traces.push({
      specIds,
      testTitle: test.title,
      testFile: test.location.file,
      specVersionAtTest,
      result: toTestResult(result.status),
    });
  }

  async onEnd(_result: FullResult): Promise<void> {
    finalizeReport(this.traces, this.options);
  }
}

export default PratyaReporter;
