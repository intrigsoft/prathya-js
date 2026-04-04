import * as fs from 'node:fs';
import {
  parseContract,
  audit,
  type CoverageMatrix,
  type Violation,
} from '@intrigsoft/pratya-core';

export function auditCommand(options: {
  contract: string;
  report?: string;
}): void {
  let contract;
  try {
    contract = parseContract(options.contract);
  } catch (err) {
    console.error(`Failed to parse contract: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  // Load existing report for traces and staleness check
  let previousReport: CoverageMatrix | undefined;
  const traces: Array<{ requirementIds: string[]; testTitle: string; testFile: string; requirementVersionAtTest?: Record<string, string>; result?: 'passed' | 'failed' | 'skipped' }> = [];

  if (options.report) {
    try {
      const raw = JSON.parse(fs.readFileSync(options.report, 'utf-8'));
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

      // Reconstruct traces from the report's requirements
      for (const req of raw.requirements ?? []) {
        for (const test of req.tests ?? []) {
          traces.push({
            requirementIds: [req.id],
            testTitle: test.title,
            testFile: '',
            requirementVersionAtTest: { [req.id]: test.requirementVersionAtTest },
            result: req.passing === true ? 'passed' : req.passing === false ? 'failed' : undefined,
          });
        }
        for (const cc of req.cornerCases ?? []) {
          if (cc.covered) {
            traces.push({
              requirementIds: [cc.id],
              testTitle: `(corner case ${cc.id})`,
              testFile: '',
              result: cc.passing === true ? 'passed' : cc.passing === false ? 'failed' : undefined,
            });
          }
        }
      }
    } catch (err) {
      console.error(`Warning: Failed to read report at ${options.report}: ${(err as Error).message}`);
    }
  }

  const violations = audit(contract, traces, previousReport);

  const isCI = process.env.CI === 'true';

  if (violations.length === 0) {
    console.log('No violations found.');
    return;
  }

  for (const v of violations) {
    if (isCI) {
      emitGitHubAnnotation(v, options.contract);
    }
    const prefix = v.severity === 'ERROR' ? '✗' : '⚠';
    console.log(`${prefix} [${v.type}] ${v.message}`);
  }

  const errorCount = violations.filter(v => v.severity === 'ERROR').length;
  const warnCount = violations.filter(v => v.severity === 'WARN').length;

  console.log(`\n${errorCount} error(s), ${warnCount} warning(s)`);

  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

function emitGitHubAnnotation(v: Violation, contractPath: string): void {
  const level = v.severity === 'ERROR' ? 'error' : 'warning';
  const file = v.testTitle ? '' : `file=${contractPath}`;
  console.log(`::${level} ${file}::${v.message} (${v.type})`);
}
