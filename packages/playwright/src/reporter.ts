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
  RequirementStatus,
  TraceEntry,
  TestResult,
  IntegrationReporterOptions,
} from '@intrigsoft/pratya-core';

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
  private options: IntegrationReporterOptions;
  private traces: TraceEntry[] = [];

  constructor(options?: PratyaReporterOptions) {
    this.options = resolveReporterOptions({
      contractPath: options?.contractPath,
      outputDir: options?.outputDir,
      failOnViolations: options?.failOnViolations,
      minimumRequirementCoverage: options?.minimumRequirementCoverage,
      excludeStatuses: options?.excludeStatuses,
      codeCoverage: options?.codeCoverage,
    });
  }

  onTestEnd(test: TestCase, result: PlaywrightTestResult): void {
    const reqAnnotations = test.annotations.filter(a => a.type === 'requirement');
    if (reqAnnotations.length === 0) return;

    const requirementIds = reqAnnotations
      .map(a => a.description)
      .filter((d): d is string => typeof d === 'string');

    if (requirementIds.length === 0) return;

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
      // Contract not parseable at this stage
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
    finalizeReport(this.traces, this.options);
  }
}

export default PratyaReporter;
