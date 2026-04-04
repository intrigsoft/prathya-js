import type {
  ModuleContract,
  TraceEntry,
  CoverageMatrix,
  Violation,
} from './model.js';

export const ORPHAN_ANNOTATION = 'ORPHAN_ANNOTATION';
export const UNCOVERED_SPEC = 'UNCOVERED_SPEC';
export const UNCOVERED_CASE = 'UNCOVERED_CASE';
export const DEPRECATED_REFERENCE = 'DEPRECATED_REFERENCE';
export const SUPERSEDED_REFERENCE = 'SUPERSEDED_REFERENCE';
export const BROKEN_SUPERSESSION = 'BROKEN_SUPERSESSION';
export const STALE_SPEC_VERSION = 'STALE_SPEC_VERSION';
export const COVERAGE_BELOW_THRESHOLD = 'COVERAGE_BELOW_THRESHOLD';

export function audit(
  contract: ModuleContract,
  traces: TraceEntry[],
  previousReport?: CoverageMatrix,
): Violation[] {
  const violations: Violation[] = [];

  const specMap = new Map(contract.specs.map(s => [s.id, s]));
  const caseSet = new Set<string>();
  for (const spec of contract.specs) {
    for (const c of spec.cases) {
      caseSet.add(c.id);
    }
  }
  const allKnownIds = new Set([...specMap.keys(), ...caseSet]);

  // Build coverage maps from traces
  const coveredSpecIds = new Set<string>();
  const coveredCaseIds = new Set<string>();

  for (const trace of traces) {
    for (const id of trace.specIds) {
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

      // Check if this references a spec directly
      const spec = specMap.get(id);
      if (spec) {
        coveredSpecIds.add(id);

        // DEPRECATED_REFERENCE
        if (spec.status === 'deprecated') {
          violations.push({
            severity: 'WARN',
            type: DEPRECATED_REFERENCE,
            specId: id,
            testTitle: trace.testTitle,
            message: `Test '${trace.testTitle}' references deprecated spec '${id}'`,
          });
        }

        // SUPERSEDED_REFERENCE
        if (spec.status === 'superseded') {
          violations.push({
            severity: 'WARN',
            type: SUPERSEDED_REFERENCE,
            specId: id,
            testTitle: trace.testTitle,
            message: `Test '${trace.testTitle}' references superseded spec '${id}'${spec.supersededBy ? ` (superseded by ${spec.supersededBy})` : ''}`,
          });
        }
      }

      // Check if it's a case
      if (caseSet.has(id)) {
        coveredCaseIds.add(id);
      }
    }
  }

  // UNCOVERED_SPEC: approved spec with no mapped test
  for (const spec of contract.specs) {
    if (spec.status === 'approved' && !coveredSpecIds.has(spec.id)) {
      violations.push({
        severity: 'ERROR',
        type: UNCOVERED_SPEC,
        specId: spec.id,
        message: `Approved spec '${spec.id}' (${spec.title}) has no mapped test`,
      });
    }

    // UNCOVERED_CASE: approved spec's case with no mapped test
    if (spec.status === 'approved') {
      for (const c of spec.cases) {
        if (!coveredCaseIds.has(c.id)) {
          violations.push({
            severity: 'WARN',
            type: UNCOVERED_CASE,
            specId: spec.id,
            caseId: c.id,
            message: `Case '${c.id}' (${c.description}) has no mapped test`,
          });
        }
      }
    }
  }

  // BROKEN_SUPERSESSION
  const allSpecIds = new Set(contract.specs.map(s => s.id));
  for (const spec of contract.specs) {
    if (spec.supersededBy && !allSpecIds.has(spec.supersededBy)) {
      violations.push({
        severity: 'ERROR',
        type: BROKEN_SUPERSESSION,
        specId: spec.id,
        message: `Spec '${spec.id}' has superseded_by '${spec.supersededBy}' which does not exist`,
      });
    }
    if (spec.supersedes && !allSpecIds.has(spec.supersedes)) {
      violations.push({
        severity: 'ERROR',
        type: BROKEN_SUPERSESSION,
        specId: spec.id,
        message: `Spec '${spec.id}' has supersedes '${spec.supersedes}' which does not exist`,
      });
    }
  }

  // STALE_SPEC_VERSION: from previous report
  if (previousReport) {
    for (const prevSpec of previousReport.specs) {
      const currentSpec = specMap.get(prevSpec.id);
      if (!currentSpec) continue;

      for (const test of prevSpec.tests) {
        if (test.specVersionAtTest && test.specVersionAtTest !== currentSpec.version) {
          violations.push({
            severity: 'WARN',
            type: STALE_SPEC_VERSION,
            specId: prevSpec.id,
            testTitle: test.title,
            message: `Test '${test.title}' was verified against '${prevSpec.id}' v${test.specVersionAtTest} but CONTRACT.yaml is now v${currentSpec.version}`,
          });
        }
      }
    }
  }

  return violations;
}
