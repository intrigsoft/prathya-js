import type { RequirementStatus } from '@intrigsoft/pratya-core';

export interface PratyaVitestReporterOptions {
  contractPath?: string;
  outputDir?: string;
  failOnViolations?: boolean;
  minimumRequirementCoverage?: number;
  excludeStatuses?: RequirementStatus[];
  codeCoverage?: { summaryPath: string };
}

declare class PratyaVitestReporter {
  constructor(options?: PratyaVitestReporterOptions);
  onFinished(files?: unknown[]): void;
}

export default PratyaVitestReporter;
