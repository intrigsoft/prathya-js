import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Mustache from 'mustache';
import type { CoverageMatrix } from './model.js';

export function writeJsonReport(matrix: CoverageMatrix, outputPath: string): void {
  const totalRequirements = matrix.requirements.length;
  // Active = those not excluded (everything in the matrix is active by definition from coverage computation)
  const activeRequirements = matrix.requirements.filter(
    r => r.status === 'approved' || r.status === 'draft',
  );
  const coveredRequirements = activeRequirements.filter(r => r.covered).length;

  const totalCornerCases = matrix.requirements.reduce(
    (sum, r) => sum + r.cornerCases.length,
    0,
  );
  const coveredCornerCases = matrix.requirements.reduce(
    (sum, r) => sum + r.cornerCases.filter(cc => cc.covered).length,
    0,
  );

  const report = {
    module: matrix.moduleId,
    generatedAt: matrix.generatedAt,
    summary: {
      totalRequirements,
      activeRequirements: activeRequirements.length,
      coveredRequirements,
      requirementCoverage: matrix.requirementCoverage,
      totalCornerCases,
      coveredCornerCases,
      cornerCaseCoverage: matrix.cornerCaseCoverage,
      ...(matrix.codeCoverage !== undefined ? { codeCoverage: matrix.codeCoverage } : {}),
    },
    requirements: matrix.requirements,
    violations: matrix.violations,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
}

export function writeHtmlReport(matrix: CoverageMatrix, outputDir: string): void {
  const templatePath = resolveTemplatePath();
  const template = fs.readFileSync(templatePath, 'utf-8');

  const quadrant = getQuadrant(matrix.requirementCoverage, matrix.codeCoverage);

  const view = {
    moduleId: matrix.moduleId,
    moduleName: matrix.moduleName,
    generatedAt: matrix.generatedAt,
    requirementCoverage: matrix.requirementCoverage.toFixed(1),
    cornerCaseCoverage: matrix.cornerCaseCoverage.toFixed(1),
    hasCodeCoverage: matrix.codeCoverage !== undefined,
    codeCoverage: matrix.codeCoverage?.toFixed(1),
    quadrantLabel: quadrant.label,
    quadrantClass: quadrant.cssClass,
    requirements: matrix.requirements.map(r => ({
      ...r,
      statusClass: r.status,
      passingClass: r.passing === null ? 'not-covered' : r.passing ? 'passing' : 'failing',
      passingLabel: r.passing === null ? 'No tests' : r.passing ? 'Passing' : 'Failing',
      hasCornerCases: r.cornerCases.length > 0,
      cornerCases: r.cornerCases.map(cc => ({
        ...cc,
        passingClass: cc.passing === null ? 'not-covered' : cc.passing ? 'passing' : 'failing',
        passingLabel: cc.passing === null ? 'No tests' : cc.passing ? 'Passing' : 'Failing',
      })),
      hasTests: r.tests.length > 0,
    })),
    errorViolations: matrix.violations.filter(v => v.severity === 'ERROR'),
    warnViolations: matrix.violations.filter(v => v.severity === 'WARN'),
    hasErrors: matrix.violations.some(v => v.severity === 'ERROR'),
    hasWarnings: matrix.violations.some(v => v.severity === 'WARN'),
  };

  const html = Mustache.render(template, view);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'index.html'), html, 'utf-8');
}

function resolveTemplatePath(): string {
  // Works in both ESM (dist) and test contexts
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
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
  reqCoverage: number,
  codeCoverage?: number,
): { label: string; cssClass: string } {
  const reqHigh = reqCoverage >= 70;
  const codeHigh = codeCoverage !== undefined && codeCoverage >= 70;
  const codeAvailable = codeCoverage !== undefined;

  if (!codeAvailable) {
    return reqHigh
      ? { label: 'Requirement Coverage High', cssClass: 'quadrant-good' }
      : { label: 'Requirement Coverage Low', cssClass: 'quadrant-danger' };
  }

  if (reqHigh && codeHigh) return { label: 'Healthy', cssClass: 'quadrant-healthy' };
  if (reqHigh && !codeHigh) return { label: 'Dead code or over-abstraction', cssClass: 'quadrant-warn' };
  if (!reqHigh && codeHigh) return { label: 'Undocumented/missing features', cssClass: 'quadrant-warn' };
  return { label: 'Chaos — prototype territory', cssClass: 'quadrant-danger' };
}
