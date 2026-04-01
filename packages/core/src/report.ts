import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import Mustache from 'mustache';
import type { CoverageMatrix, ModuleContract } from './model.js';

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

export function writeHtmlReport(matrix: CoverageMatrix, outputDir: string, contract?: ModuleContract): void {
  const templatePath = resolveTemplatePath();
  const template = fs.readFileSync(templatePath, 'utf-8');

  // Build a lookup from contract for descriptions and acceptance criteria
  const contractReqMap = new Map<string, { description: string; acceptanceCriteria: string[]; cornerCaseDescriptions: Map<string, string> }>();
  if (contract) {
    for (const req of contract.requirements) {
      const ccDescriptions = new Map<string, string>();
      for (const cc of req.cornerCases) {
        ccDescriptions.set(cc.id, cc.description);
      }
      contractReqMap.set(req.id, {
        description: req.description,
        acceptanceCriteria: req.acceptanceCriteria,
        cornerCaseDescriptions: ccDescriptions,
      });
    }
  }

  // Aggregate counts
  const activeReqCount = matrix.requirements.length;
  const coveredReqCount = matrix.requirements.filter(r => r.covered).length;
  const totalCcCount = matrix.requirements.reduce((s, r) => s + r.cornerCases.length, 0);
  const coveredCcCount = matrix.requirements.reduce((s, r) => s + r.cornerCases.filter(cc => cc.covered).length, 0);
  const totalItemCount = activeReqCount + totalCcCount;
  const coveredItemCount = coveredReqCount + coveredCcCount;

  // Build violation map keyed by requirementId
  const violationsByReq = new Map<string, typeof matrix.violations>();
  for (const v of matrix.violations) {
    const key = v.requirementId ?? '__global__';
    const list = violationsByReq.get(key) ?? [];
    list.push(v);
    violationsByReq.set(key, list);
  }

  const view = {
    moduleId: matrix.moduleId,
    moduleName: matrix.moduleName,
    generatedAt: matrix.generatedAt,
    requirementCoverage: matrix.requirementCoverage.toFixed(1),
    cornerCaseCoverage: matrix.cornerCaseCoverage.toFixed(1),
    hasCodeCoverage: matrix.codeCoverage !== undefined,
    codeCoverage: matrix.codeCoverage?.toFixed(1),

    // Summary counts
    activeReqCount,
    coveredReqCount,
    totalCcCount,
    coveredCcCount,
    totalItemCount,
    coveredItemCount,

    // Violations
    hasViolations: matrix.violations.length > 0,
    violationCount: matrix.violations.length,
    allViolations: matrix.violations.map(v => ({
      ...v,
      severityLower: v.severity.toLowerCase(),
    })),

    requirements: matrix.requirements.map(r => {
      const contractInfo = contractReqMap.get(r.id);
      const reqCoveredCcCount = r.cornerCases.filter(cc => cc.covered).length;
      const reqTotalCcCount = r.cornerCases.length;
      const reqViolations = violationsByReq.get(r.id) ?? [];

      return {
        ...r,
        description: contractInfo?.description ?? '',
        acceptanceCriteria: contractInfo?.acceptanceCriteria ?? [],
        hasAcceptanceCriteria: (contractInfo?.acceptanceCriteria ?? []).length > 0,
        testCount: r.tests.length,
        hasTests: r.tests.length > 0,
        hasCornerCases: r.cornerCases.length > 0,
        coveredCcCount: reqCoveredCcCount,
        totalCcCount: reqTotalCcCount,
        coverageBadgeClass: r.covered ? (r.passing ? 'covered' : 'failing') : 'uncovered',
        coverageBadgeLabel: r.covered ? (r.passing ? 'covered' : 'failing') : 'uncovered',
        cornerCases: r.cornerCases.map(cc => ({
          ...cc,
          description: contractInfo?.cornerCaseDescriptions?.get(cc.id) ?? cc.id,
          ccCoveredClass: cc.covered ? 'cc-covered' : 'cc-uncovered',
          ccBadgeClass: cc.covered ? 'covered' : 'uncovered',
          ccBadgeLabel: cc.covered ? 'covered' : 'uncovered',
        })),
        hasReqViolations: reqViolations.length > 0,
        reqViolations: reqViolations.map(v => ({
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
