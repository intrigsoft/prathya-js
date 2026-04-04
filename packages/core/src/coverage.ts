import * as fs from 'node:fs';
import type {
  ModuleContract,
  TraceEntry,
  CoverageMatrix,
  SpecCoverage,
  CaseCoverage,
  SpecStatus,
} from './model.js';

export interface CoverageOptions {
  excludeStatuses?: SpecStatus[];
  codeCoverageSummaryPath?: string;
}

export function computeCoverage(
  contract: ModuleContract,
  traces: TraceEntry[],
  options?: CoverageOptions,
): CoverageMatrix {
  const excludeStatuses = options?.excludeStatuses ?? ['deprecated', 'superseded'];

  const activeSpecs = contract.specs.filter(
    s => !excludeStatuses.includes(s.status),
  );

  // Build a map: spec/case ID → traces that reference it
  const tracesBySpecId = new Map<string, TraceEntry[]>();
  for (const trace of traces) {
    for (const id of trace.specIds) {
      const existing = tracesBySpecId.get(id);
      if (existing) {
        existing.push(trace);
      } else {
        tracesBySpecId.set(id, [trace]);
      }
    }
  }

  const specCoverages: SpecCoverage[] = activeSpecs.map(spec => {
    const specTraces = tracesBySpecId.get(spec.id) ?? [];
    // "covered" = has linked tests (traceability)
    const covered = specTraces.length > 0;

    let passing: boolean | null = null;
    if (covered) {
      const hasFailure = specTraces.some(t => t.result === 'failed');
      passing = !hasFailure;
    }

    const tests = specTraces.map(t => ({
      title: t.testTitle,
      specVersionAtTest: t.specVersionAtTest?.[spec.id] ?? spec.version,
    }));

    const cases: CaseCoverage[] = spec.cases.map(c => {
      const caseTraces = tracesBySpecId.get(c.id) ?? [];
      const caseCovered = caseTraces.length > 0;
      let casePassing: boolean | null = null;
      if (caseCovered) {
        casePassing = !caseTraces.some(t => t.result === 'failed');
      }
      return { id: c.id, covered: caseCovered, passing: casePassing };
    });

    return {
      id: spec.id,
      title: spec.title,
      version: spec.version,
      status: spec.status,
      covered,
      passing,
      tests,
      cases,
    };
  });

  const totalActive = activeSpecs.length;
  const coveredCount = specCoverages.filter(s => s.covered).length;
  const specCoverage = totalActive > 0
    ? Math.round((coveredCount / totalActive) * 1000) / 10
    : 0;

  const totalCases = activeSpecs.reduce((sum, s) => sum + s.cases.length, 0);
  const coveredCases = specCoverages.reduce(
    (sum, s) => sum + s.cases.filter(c => c.covered).length,
    0,
  );
  const caseCoverage = totalCases > 0
    ? Math.round((coveredCases / totalCases) * 1000) / 10
    : 0;

  const passingCases = specCoverages.reduce(
    (sum, s) => sum + s.cases.filter(c => c.passing === true).length,
    0,
  );
  const passingCaseCoverage = totalCases > 0
    ? Math.round((passingCases / totalCases) * 1000) / 10
    : 0;

  let codeCoverage: number | undefined;
  if (options?.codeCoverageSummaryPath) {
    codeCoverage = readCodeCoverage(options.codeCoverageSummaryPath);
  }

  return {
    moduleId: contract.moduleId,
    moduleName: contract.moduleName,
    generatedAt: new Date().toISOString(),
    specCoverage,
    caseCoverage,
    passingCaseCoverage,
    codeCoverage,
    specs: specCoverages,
    violations: [],
  };
}

function readCodeCoverage(summaryPath: string): number | undefined {
  try {
    const content = fs.readFileSync(summaryPath, 'utf-8');
    const summary = JSON.parse(content) as {
      total?: { lines?: { pct?: number } };
    };
    return summary.total?.lines?.pct;
  } catch {
    return undefined;
  }
}
