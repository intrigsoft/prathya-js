export type {
  RequirementStatus,
  TestResult,
  ViolationSeverity,
  CornerCase,
  ChangelogEntry,
  Requirement,
  ModuleContract,
  TraceEntry,
  CornerCaseCoverage,
  RequirementCoverage,
  Violation,
  CoverageMatrix,
} from './model.js';

export { parseContract, parseContractYaml } from './parser.js';
export { computeCoverage } from './coverage.js';
export type { CoverageOptions } from './coverage.js';
export {
  audit,
  ORPHAN_ANNOTATION,
  UNCOVERED_REQUIREMENT,
  UNCOVERED_CORNER_CASE,
  DEPRECATED_REFERENCE,
  SUPERSEDED_REFERENCE,
  BROKEN_SUPERSESSION,
  STALE_REQUIREMENT_VERSION,
  COVERAGE_BELOW_THRESHOLD,
} from './audit.js';
export { writeHtmlReport, writeJsonReport } from './report.js';
export {
  finalizeReport,
  resolveReporterOptions,
  DEFAULT_REPORTER_OPTIONS,
  writeTraces,
  readTraces,
} from './reporter-utils.js';
export type { IntegrationReporterOptions } from './reporter-utils.js';
export {
  addRequirement,
  updateRequirement,
  addCornerCase,
  updateCornerCase,
  deprecateRequirement,
  supersedeRequirement,
} from './mutator.js';
export type {
  AddRequirementInput,
  UpdateRequirementInput,
  AddCornerCaseInput,
  UpdateCornerCaseInput,
} from './mutator.js';
