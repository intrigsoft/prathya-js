import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Mustache from 'mustache';
import type { CoverageMatrix, ModuleContract } from './model.js';

export function writeJsonReport(matrix: CoverageMatrix, outputPath: string): void {
  const totalSpecs = matrix.specs.length;
  const activeSpecs = matrix.specs.filter(
    s => s.status === 'approved' || s.status === 'draft',
  );
  const coveredSpecs = activeSpecs.filter(s => s.covered).length;

  const totalCases = matrix.specs.reduce(
    (sum, s) => sum + s.cases.length,
    0,
  );
  const coveredCases = matrix.specs.reduce(
    (sum, s) => sum + s.cases.filter(c => c.covered).length,
    0,
  );

  const report = {
    module: matrix.moduleId,
    generatedAt: matrix.generatedAt,
    summary: {
      totalSpecs,
      activeSpecs: activeSpecs.length,
      coveredSpecs,
      specCoverage: matrix.specCoverage,
      totalCases,
      coveredCases,
      caseCoverage: matrix.caseCoverage,
      passingCaseCoverage: matrix.passingCaseCoverage,
      ...(matrix.codeCoverage !== undefined ? { codeCoverage: matrix.codeCoverage } : {}),
    },
    specs: matrix.specs,
    violations: matrix.violations,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

export function writeHtmlReport(matrix: CoverageMatrix, outputDir: string, contract?: ModuleContract): void {
  const templatePath = resolveTemplatePath();
  const template = fs.readFileSync(templatePath, 'utf-8');

  // Build a lookup from contract for descriptions and acceptance criteria
  const contractSpecMap = new Map<string, { description: string; acceptanceCriteria: string[]; caseDescriptions: Map<string, string> }>();
  if (contract) {
    for (const spec of contract.specs) {
      const caseDescriptions = new Map<string, string>();
      for (const c of spec.cases) {
        caseDescriptions.set(c.id, c.description);
      }
      contractSpecMap.set(spec.id, {
        description: spec.description,
        acceptanceCriteria: spec.acceptanceCriteria,
        caseDescriptions,
      });
    }
  }

  // Aggregate counts
  const activeSpecCount = matrix.specs.length;
  const coveredSpecCount = matrix.specs.filter(s => s.covered).length;
  const totalCaseCount = matrix.specs.reduce((sum, s) => sum + s.cases.length, 0);
  const coveredCaseCount = matrix.specs.reduce((sum, s) => sum + s.cases.filter(c => c.covered).length, 0);
  const passingCaseCount = matrix.specs.reduce((sum, s) => sum + s.cases.filter(c => c.passing === true).length, 0);
  const totalItemCount = activeSpecCount + totalCaseCount;
  const coveredItemCount = coveredSpecCount + coveredCaseCount;

  // Build violation map keyed by specId
  const violationsBySpec = new Map<string, typeof matrix.violations>();
  for (const v of matrix.violations) {
    const key = v.specId ?? '__global__';
    const list = violationsBySpec.get(key) ?? [];
    list.push(v);
    violationsBySpec.set(key, list);
  }

  const view = {
    moduleId: matrix.moduleId,
    moduleName: matrix.moduleName,
    generatedAt: matrix.generatedAt,
    specCoverage: matrix.specCoverage.toFixed(1),
    caseCoverage: matrix.caseCoverage.toFixed(1),
    passingCaseCoverage: matrix.passingCaseCoverage.toFixed(1),
    hasCodeCoverage: matrix.codeCoverage !== undefined,
    codeCoverage: matrix.codeCoverage?.toFixed(1),

    // Summary counts
    activeSpecCount,
    coveredSpecCount,
    totalCaseCount,
    coveredCaseCount,
    passingCaseCount,
    totalItemCount,
    coveredItemCount,

    // Violations
    hasViolations: matrix.violations.length > 0,
    violationCount: matrix.violations.length,
    allViolations: matrix.violations.map(v => ({
      ...v,
      severityLower: v.severity.toLowerCase(),
    })),

    specs: matrix.specs.map(s => {
      const contractInfo = contractSpecMap.get(s.id);
      const specCoveredCaseCount = s.cases.filter(c => c.covered).length;
      const specTotalCaseCount = s.cases.length;
      const specViolations = violationsBySpec.get(s.id) ?? [];

      return {
        ...s,
        description: contractInfo?.description ?? '',
        acceptanceCriteria: contractInfo?.acceptanceCriteria ?? [],
        hasAcceptanceCriteria: (contractInfo?.acceptanceCriteria ?? []).length > 0,
        testCount: s.tests.length,
        hasTests: s.tests.length > 0,
        hasCases: s.cases.length > 0,
        coveredCaseCount: specCoveredCaseCount,
        totalCaseCount: specTotalCaseCount,
        coverageBadgeClass: s.covered ? (s.passing ? 'covered' : 'failing') : 'uncovered',
        coverageBadgeLabel: s.covered ? (s.passing ? 'covered' : 'failing') : 'uncovered',
        cases: s.cases.map(c => ({
          ...c,
          description: contractInfo?.caseDescriptions?.get(c.id) ?? c.id,
          ccCoveredClass: c.covered ? 'cc-covered' : 'cc-uncovered',
          ccBadgeClass: c.covered ? 'covered' : 'uncovered',
          ccBadgeLabel: c.covered ? 'covered' : 'uncovered',
        })),
        hasSpecViolations: specViolations.length > 0,
        specViolations: specViolations.map(v => ({
          ...v,
          severityLower: v.severity.toLowerCase(),
        })),
      };
    }),
  };

  const html = Mustache.render(template, view);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf-8');
}

function resolveTemplatePath(): string {
  // Works in both ESM and CJS contexts
  const currentDir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : path.dirname(fileURLToPath(import.meta.url));
  // Check if we're in dist/ or src/
  const templatesFromDist = path.resolve(currentDir, '..', 'templates', 'report.html.mustache');
  const templatesFromSrc = path.resolve(currentDir, '..', '..', 'templates', 'report.html.mustache');

  if (fs.existsSync(templatesFromDist)) return templatesFromDist;
  if (fs.existsSync(templatesFromSrc)) return templatesFromSrc;

  // Fallback: relative to package root
  const fromRoot = path.resolve(currentDir, '..', 'templates', 'report.html.mustache');
  return fromRoot;
}

function getQuadrant(
  specCoverage: number,
  codeCoverage?: number,
): { label: string; cssClass: string } {
  const specHigh = specCoverage >= 70;
  const codeHigh = codeCoverage !== undefined && codeCoverage >= 70;
  const codeAvailable = codeCoverage !== undefined;

  if (!codeAvailable) {
    return specHigh
      ? { label: 'Spec Coverage High', cssClass: 'quadrant-good' }
      : { label: 'Spec Coverage Low', cssClass: 'quadrant-danger' };
  }

  if (specHigh && codeHigh) return { label: 'Healthy', cssClass: 'quadrant-healthy' };
  if (specHigh && !codeHigh) return { label: 'Dead code or over-abstraction', cssClass: 'quadrant-warn' };
  if (!specHigh && codeHigh) return { label: 'Undocumented/missing features', cssClass: 'quadrant-warn' };
  return { label: 'Chaos — prototype territory', cssClass: 'quadrant-danger' };
}
