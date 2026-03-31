import {
  parseContract,
  finalizeReport,
  resolveReporterOptions,
} from '@pratya/core';
import type {
  RequirementStatus,
  TraceEntry,
  TestResult,
  IntegrationReporterOptions,
} from '@pratya/core';

export interface PratyaVitestReporterOptions {
  contractPath?: string;
  outputDir?: string;
  failOnViolations?: boolean;
  minimumRequirementCoverage?: number;
  excludeStatuses?: RequirementStatus[];
  codeCoverage?: { summaryPath: string };
}

function toTestResult(state?: string): TestResult {
  switch (state) {
    case 'pass': return 'passed';
    case 'fail': return 'failed';
    case 'skip': return 'skipped';
    default: return 'failed';
  }
}

// Minimal type definitions for Vitest reporter API to avoid dependency on @vitest/runner
interface VitestTask {
  type: string;
  name: string;
  meta: Record<string, unknown>;
  result?: { state?: string };
  tasks?: VitestTask[];
}

interface VitestFile {
  filepath: string;
  tasks: VitestTask[];
}

function collectTests(tasks: VitestTask[]): VitestTask[] {
  const result: VitestTask[] = [];
  for (const task of tasks) {
    if (task.type === 'test' || task.type === 'custom') {
      result.push(task);
    }
    if (task.tasks) {
      result.push(...collectTests(task.tasks));
    }
  }
  return result;
}

class PratyaVitestReporter {
  private options: IntegrationReporterOptions;

  constructor(options?: PratyaVitestReporterOptions) {
    this.options = resolveReporterOptions({
      contractPath: options?.contractPath,
      outputDir: options?.outputDir,
      failOnViolations: options?.failOnViolations,
      minimumRequirementCoverage: options?.minimumRequirementCoverage,
      excludeStatuses: options?.excludeStatuses,
      codeCoverage: options?.codeCoverage,
    });
  }

  onFinished(files?: VitestFile[]): void {
    if (!files || files.length === 0) return;

    const traces: TraceEntry[] = [];

    let contract;
    try {
      contract = parseContract(this.options.contractPath);
    } catch {
      // Will be caught again in finalizeReport
    }

    for (const file of files) {
      const tests = collectTests(file.tasks);
      for (const task of tests) {
        const meta = task.meta?.pratya as { requirementIds?: string[] } | undefined;
        if (!meta?.requirementIds || meta.requirementIds.length === 0) continue;

        const requirementIds = meta.requirementIds;

        let requirementVersionAtTest: Record<string, string> | undefined;
        if (contract) {
          requirementVersionAtTest = {};
          for (const id of requirementIds) {
            const req = contract.requirements.find(r => r.id === id);
            if (req) {
              requirementVersionAtTest[id] = req.version;
            }
          }
        }

        traces.push({
          requirementIds,
          testTitle: task.name,
          testFile: file.filepath,
          requirementVersionAtTest,
          result: toTestResult(task.result?.state),
        });
      }
    }

    finalizeReport(traces, this.options);
  }
}

export default PratyaVitestReporter;
