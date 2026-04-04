import {
  parseContract,
  finalizeReport,
  resolveReporterOptions,
  writeTraces,
} from '@intrigsoft/pratya-core';
import type {
  SpecStatus,
  TraceEntry,
  TestResult,
  IntegrationReporterOptions,
} from '@intrigsoft/pratya-core';

export interface PratyaVitestReporterOptions {
  contractPath?: string;
  outputDir?: string;
  failOnViolations?: boolean;
  minimumSpecCoverage?: number;
  excludeStatuses?: SpecStatus[];
  codeCoverage?: { summaryPath: string };
  /**
   * When true (default), the reporter only writes trace entries to
   * `pratya-traces.json` and defers report generation to `pratya run`.
   * This allows code coverage data (written after reporters finish)
   * to be included in the final report.
   *
   * Set to false to generate the full report inline (legacy behaviour).
   */
  deferReport?: boolean;
}

function toTestResult(state?: string): TestResult {
  switch (state) {
    case 'pass': return 'passed';
    case 'fail': return 'failed';
    case 'skip': return 'skipped';
    default: return 'failed';
  }
}

// Minimal type definitions for Vitest reporter API
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
  private deferReport: boolean;

  constructor(options?: PratyaVitestReporterOptions) {
    this.deferReport = options?.deferReport ?? true;
    this.options = resolveReporterOptions({
      contractPath: options?.contractPath,
      outputDir: options?.outputDir,
      failOnViolations: options?.failOnViolations,
      minimumSpecCoverage: options?.minimumSpecCoverage,
      excludeStatuses: options?.excludeStatuses,
      codeCoverage: options?.codeCoverage,
    });
  }

  onFinished(files?: VitestFile[]): void {
    if (!files || files.length === 0) return;

    const traces = this.collectTraces(files);

    if (this.deferReport) {
      // Write traces only — `pratya run` will generate the report after coverage is available
      writeTraces(traces, this.options.outputDir);
      console.log(`\n[pratya] ${traces.length} trace(s) collected → ${this.options.outputDir}/pratya-traces.json`);
    } else {
      // Legacy: generate report inline (no code coverage available at this point)
      finalizeReport(traces, this.options);
    }
  }

  private collectTraces(files: VitestFile[]): TraceEntry[] {
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
        const meta = task.meta?.pratya as { specIds?: string[] } | undefined;
        if (!meta?.specIds || meta.specIds.length === 0) continue;

        const specIds = meta.specIds;

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
          testTitle: task.name,
          testFile: file.filepath,
          specVersionAtTest,
          result: toTestResult(task.result?.state),
        });
      }
    }

    return traces;
  }
}

export default PratyaVitestReporter;
