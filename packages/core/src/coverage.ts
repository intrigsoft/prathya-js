import * as fs from 'node:fs';
import type {
  ModuleContract,
  TraceEntry,
  CoverageMatrix,
  RequirementCoverage,
  CornerCaseCoverage,
  RequirementStatus,
} from './model.js';

export interface CoverageOptions {
  excludeStatuses?: RequirementStatus[];
  codeCoverageSummaryPath?: string;
}

export function computeCoverage(
  contract: ModuleContract,
  traces: TraceEntry[],
  options?: CoverageOptions,
): CoverageMatrix {
  const excludeStatuses = options?.excludeStatuses ?? ['deprecated', 'superseded'];

  const activeRequirements = contract.requirements.filter(
    r => !excludeStatuses.includes(r.status),
  );

  // Build a map: requirement/corner-case ID → traces that reference it
  const tracesByReqId = new Map<string, TraceEntry[]>();
  for (const trace of traces) {
    for (const id of trace.requirementIds) {
      const existing = tracesByReqId.get(id);
      if (existing) {
        existing.push(trace);
      } else {
        tracesByReqId.set(id, [trace]);
      }
    }
  }

  const reqCoverages: RequirementCoverage[] = activeRequirements.map(req => {
    const reqTraces = tracesByReqId.get(req.id) ?? [];
    const covered = reqTraces.length > 0;

    let passing: boolean | null = null;
    if (covered) {
      const hasFailure = reqTraces.some(t => t.result === 'failed');
      passing = !hasFailure;
    }

    const tests = reqTraces.map(t => ({
      title: t.testTitle,
      requirementVersionAtTest: t.requirementVersionAtTest?.[req.id] ?? req.version,
    }));

    const cornerCases: CornerCaseCoverage[] = req.cornerCases.map(cc => {
      const ccTraces = tracesByReqId.get(cc.id) ?? [];
      const ccCovered = ccTraces.length > 0;
      let ccPassing: boolean | null = null;
      if (ccCovered) {
        ccPassing = !ccTraces.some(t => t.result === 'failed');
      }
      return { id: cc.id, covered: ccCovered, passing: ccPassing };
    });

    return {
      id: req.id,
      title: req.title,
      version: req.version,
      status: req.status,
      covered,
      passing,
      tests,
      cornerCases,
    };
  });

  const totalActive = activeRequirements.length;
  const coveredCount = reqCoverages.filter(r => r.covered).length;
  const requirementCoverage = totalActive > 0
    ? Math.round((coveredCount / totalActive) * 1000) / 10
    : 0;

  const totalCornerCases = activeRequirements.reduce((sum, r) => sum + r.cornerCases.length, 0);
  const coveredCornerCases = reqCoverages.reduce(
    (sum, r) => sum + r.cornerCases.filter(cc => cc.covered).length,
    0,
  );
  const cornerCaseCoverage = totalCornerCases > 0
    ? Math.round((coveredCornerCases / totalCornerCases) * 1000) / 10
    : 0;

  let codeCoverage: number | undefined;
  if (options?.codeCoverageSummaryPath) {
    codeCoverage = readCodeCoverage(options.codeCoverageSummaryPath);
  }

  return {
    moduleId: contract.moduleId,
    moduleName: contract.moduleName,
    generatedAt: new Date().toISOString(),
    requirementCoverage,
    cornerCaseCoverage,
    codeCoverage,
    requirements: reqCoverages,
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
