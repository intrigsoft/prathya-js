export type {
  SpecStatus,
  TestResult,
  ViolationSeverity,
  Case,
  ChangelogEntry,
  Spec,
  ModuleContract,
  TraceEntry,
  CaseCoverage,
  SpecCoverage,
  Violation,
  CoverageMatrix,
} from './model.js';

export { parseContract, parseContractYaml } from './parser.js';
export { computeCoverage } from './coverage.js';
export type { CoverageOptions } from './coverage.js';
export {
  audit,
  ORPHAN_ANNOTATION,
  UNCOVERED_SPEC,
  UNCOVERED_CASE,
  DEPRECATED_REFERENCE,
  SUPERSEDED_REFERENCE,
  BROKEN_SUPERSESSION,
  STALE_SPEC_VERSION,
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
  addSpec,
  updateSpec,
  addCase,
  updateCase,
  deprecateSpec,
  supersedeSpec,
} from './mutator.js';
export type {
  AddSpecInput,
  UpdateSpecInput,
  AddCaseInput,
  UpdateCaseInput,
} from './mutator.js';
