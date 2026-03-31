export type RequirementStatus = 'draft' | 'approved' | 'deprecated' | 'superseded';
export type TestResult = 'passed' | 'failed' | 'skipped';
export type ViolationSeverity = 'ERROR' | 'WARN';

export interface CornerCase {
  id: string;
  description: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  note: string;
}

export interface Requirement {
  id: string;
  version: string;
  status: RequirementStatus;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  cornerCases: CornerCase[];
  supersedes?: string;
  supersededBy?: string;
  changelog: ChangelogEntry[];
}

export interface ModuleContract {
  moduleId: string;
  moduleName: string;
  description: string;
  owner?: string;
  created: string;
  version: string;
  requirements: Requirement[];
}

export interface TraceEntry {
  requirementIds: string[];
  testTitle: string;
  testFile: string;
  requirementVersionAtTest?: Record<string, string>;
  result?: TestResult;
}

export interface CornerCaseCoverage {
  id: string;
  covered: boolean;
  passing: boolean | null;
}

export interface RequirementCoverage {
  id: string;
  title: string;
  version: string;
  status: RequirementStatus;
  covered: boolean;
  passing: boolean | null;
  tests: Array<{ title: string; requirementVersionAtTest: string }>;
  cornerCases: CornerCaseCoverage[];
  codeCoveragePercent?: number;
}

export interface Violation {
  severity: ViolationSeverity;
  type: string;
  requirementId?: string;
  cornerCaseId?: string;
  testTitle?: string;
  message: string;
}

export interface CoverageMatrix {
  moduleId: string;
  moduleName: string;
  generatedAt: string;
  requirementCoverage: number;
  cornerCaseCoverage: number;
  codeCoverage?: number;
  requirements: RequirementCoverage[];
  violations: Violation[];
}
