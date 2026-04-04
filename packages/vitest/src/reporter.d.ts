import type { SpecStatus } from '@intrigsoft/pratya-core';

export interface PratyaVitestReporterOptions {
  contractPath?: string;
  outputDir?: string;
  failOnViolations?: boolean;
  minimumSpecCoverage?: number;
  excludeStatuses?: SpecStatus[];
  codeCoverage?: { summaryPath: string };
}

declare class PratyaVitestReporter {
  constructor(options?: PratyaVitestReporterOptions);
  onFinished(files?: unknown[]): void;
}

export default PratyaVitestReporter;
