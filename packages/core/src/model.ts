export type SpecStatus = 'draft' | 'approved' | 'deprecated' | 'superseded';
export type TestResult = 'passed' | 'failed' | 'skipped';
export type ViolationSeverity = 'ERROR' | 'WARN';

export interface Case {
  id: string;
  description: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  note: string;
}

export interface Spec {
  id: string;
  version: string;
  status: SpecStatus;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  cases: Case[];
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
  specs: Spec[];
}

export interface TraceEntry {
  specIds: string[];
  testTitle: string;
  testFile: string;
  specVersionAtTest?: Record<string, string>;
  result?: TestResult;
}

export interface CaseCoverage {
  id: string;
  covered: boolean;
  passing: boolean | null;
}

export interface SpecCoverage {
  id: string;
  title: string;
  version: string;
  status: SpecStatus;
  covered: boolean;
  passing: boolean | null;
  tests: Array<{ title: string; specVersionAtTest: string }>;
  cases: CaseCoverage[];
  codeCoveragePercent?: number;
}

export interface Violation {
  severity: ViolationSeverity;
  type: string;
  specId?: string;
  caseId?: string;
  testTitle?: string;
  message: string;
}

export interface CoverageMatrix {
  moduleId: string;
  moduleName: string;
  generatedAt: string;
  specCoverage: number;
  caseCoverage: number;
  passingCaseCoverage: number;
  codeCoverage?: number;
  specs: SpecCoverage[];
  violations: Violation[];
}
