import type {
  ModuleContract,
  TraceEntry,
  CoverageMatrix,
  Violation,
  RequirementStatus,
} from './model.js';

export const ORPHAN_ANNOTATION = 'ORPHAN_ANNOTATION';
export const UNCOVERED_REQUIREMENT = 'UNCOVERED_REQUIREMENT';
export const UNCOVERED_CORNER_CASE = 'UNCOVERED_CORNER_CASE';
export const DEPRECATED_REFERENCE = 'DEPRECATED_REFERENCE';
export const SUPERSEDED_REFERENCE = 'SUPERSEDED_REFERENCE';
export const BROKEN_SUPERSESSION = 'BROKEN_SUPERSESSION';
export const STALE_REQUIREMENT_VERSION = 'STALE_REQUIREMENT_VERSION';
export const COVERAGE_BELOW_THRESHOLD = 'COVERAGE_BELOW_THRESHOLD';

export function audit(
  contract: ModuleContract,
  traces: TraceEntry[],
  previousReport?: CoverageMatrix,
): Violation[] {
  const violations: Violation[] = [];

  const reqMap = new Map(contract.requirements.map(r => [r.id, r]));
  const ccSet = new Set<string>();
  for (const req of contract.requirements) {
    for (const cc of req.cornerCases) {
      ccSet.add(cc.id);
    }
  }
  const allKnownIds = new Set([...reqMap.keys(), ...ccSet]);

  // Build coverage maps from traces
  const coveredReqIds = new Set<string>();
  const coveredCcIds = new Set<string>();

  for (const trace of traces) {
    for (const id of trace.requirementIds) {
      // ORPHAN_ANNOTATION: ID not found in CONTRACT.yaml
      if (!allKnownIds.has(id)) {
        violations.push({
          severity: 'ERROR',
          type: ORPHAN_ANNOTATION,
          testTitle: trace.testTitle,
          message: `Test '${trace.testTitle}' references '${id}' which does not exist in CONTRACT.yaml`,
        });
        continue;
      }

      // Check if this references a requirement directly
      const req = reqMap.get(id);
      if (req) {
        coveredReqIds.add(id);

        // DEPRECATED_REFERENCE
        if (req.status === 'deprecated') {
          violations.push({
            severity: 'WARN',
            type: DEPRECATED_REFERENCE,
            requirementId: id,
            testTitle: trace.testTitle,
            message: `Test '${trace.testTitle}' references deprecated requirement '${id}'`,
          });
        }

        // SUPERSEDED_REFERENCE
        if (req.status === 'superseded') {
          violations.push({
            severity: 'WARN',
            type: SUPERSEDED_REFERENCE,
            requirementId: id,
            testTitle: trace.testTitle,
            message: `Test '${trace.testTitle}' references superseded requirement '${id}'${req.supersededBy ? ` (superseded by ${req.supersededBy})` : ''}`,
          });
        }
      }

      // Check if it's a corner case
      if (ccSet.has(id)) {
        coveredCcIds.add(id);
      }
    }
  }

  // UNCOVERED_REQUIREMENT: approved requirement with no mapped test
  for (const req of contract.requirements) {
    if (req.status === 'approved' && !coveredReqIds.has(req.id)) {
      violations.push({
        severity: 'ERROR',
        type: UNCOVERED_REQUIREMENT,
        requirementId: req.id,
        message: `Approved requirement '${req.id}' (${req.title}) has no mapped test`,
      });
    }

    // UNCOVERED_CORNER_CASE: approved requirement's corner case with no mapped test
    if (req.status === 'approved') {
      for (const cc of req.cornerCases) {
        if (!coveredCcIds.has(cc.id)) {
          violations.push({
            severity: 'WARN',
            type: UNCOVERED_CORNER_CASE,
            requirementId: req.id,
            cornerCaseId: cc.id,
            message: `Corner case '${cc.id}' (${cc.description}) has no mapped test`,
          });
        }
      }
    }
  }

  // BROKEN_SUPERSESSION
  const allReqIds = new Set(contract.requirements.map(r => r.id));
  for (const req of contract.requirements) {
    if (req.supersededBy && !allReqIds.has(req.supersededBy)) {
      violations.push({
        severity: 'ERROR',
        type: BROKEN_SUPERSESSION,
        requirementId: req.id,
        message: `Requirement '${req.id}' has superseded_by '${req.supersededBy}' which does not exist`,
      });
    }
    if (req.supersedes && !allReqIds.has(req.supersedes)) {
      violations.push({
        severity: 'ERROR',
        type: BROKEN_SUPERSESSION,
        requirementId: req.id,
        message: `Requirement '${req.id}' has supersedes '${req.supersedes}' which does not exist`,
      });
    }
  }

  // STALE_REQUIREMENT_VERSION: from previous report
  if (previousReport) {
    for (const prevReq of previousReport.requirements) {
      const currentReq = reqMap.get(prevReq.id);
      if (!currentReq) continue;

      for (const test of prevReq.tests) {
        if (test.requirementVersionAtTest && test.requirementVersionAtTest !== currentReq.version) {
          violations.push({
            severity: 'WARN',
            type: STALE_REQUIREMENT_VERSION,
            requirementId: prevReq.id,
            testTitle: test.title,
            message: `Test '${test.title}' was verified against '${prevReq.id}' v${test.requirementVersionAtTest} but CONTRACT.yaml is now v${currentReq.version}`,
          });
        }
      }
    }
  }

  return violations;
}
