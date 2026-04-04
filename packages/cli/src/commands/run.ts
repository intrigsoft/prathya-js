import {
  parseContract,
  readTraces,
  finalizeReport,
  resolveReporterOptions,
} from '@intrigsoft/pratya-core';
import type { SpecStatus } from '@intrigsoft/pratya-core';
import { execa } from 'execa';

export interface RunOptions {
  contract: string;
  spec?: string;
  runner: 'vitest' | 'playwright' | 'jest';
  outputDir: string;
  coverage?: boolean;
  coverageSummary?: string;
  failOnViolations?: boolean;
  minimumSpecCoverage?: number;
  excludeStatuses?: SpecStatus[];
}

export async function runCommand(options: RunOptions): Promise<void> {
  const contract = loadContract(options.contract);
  if (!contract) return;

  // 1. Build the grep filter
  let filter: string | undefined;
  if (options.spec) {
    filter = `@spec:${options.spec}`;
  } else {
    const approvedIds = contract.specs
      .filter(r => r.status === 'approved')
      .map(r => r.id);

    if (approvedIds.length === 0) {
      console.log('No approved specs found in CONTRACT.yaml');
      return;
    }

    filter = `@spec:(${approvedIds.join('|')})`;
  }

  // 2. Run the test suite
  const testExitCode = await runTestSuite(options, filter);

  // 3. After tests + coverage complete, generate the full report from traces
  console.log('\n[pratya] Generating report...');

  const traces = readTraces(options.outputDir);
  if (traces.length === 0) {
    console.log('[pratya] No traces found — did the test reporter write pratya-traces.json?');
    if (testExitCode !== 0) {
      process.exitCode = 1;
    }
    return;
  }

  // Resolve the coverage summary path
  let codeCoverageSummaryPath: string | undefined;
  if (options.coverageSummary) {
    codeCoverageSummaryPath = options.coverageSummary;
  } else if (options.coverage) {
    // Auto-detect common paths
    const candidates = [
      './coverage/coverage-summary.json',
      './coverage-summary.json',
    ];
    codeCoverageSummaryPath = candidates.find(p => {
      try { return require('node:fs').existsSync(p); } catch { return false; }
    });
  }

  const reporterOptions = resolveReporterOptions({
    contractPath: options.contract,
    outputDir: options.outputDir,
    failOnViolations: options.failOnViolations,
    minimumSpecCoverage: options.minimumSpecCoverage,
    excludeStatuses: options.excludeStatuses,
    codeCoverage: codeCoverageSummaryPath ? { summaryPath: codeCoverageSummaryPath } : undefined,
  });

  const matrix = finalizeReport(traces, reporterOptions);

  if (!matrix) {
    process.exitCode = 1;
    return;
  }

  if (testExitCode !== 0) {
    process.exitCode = 1;
  }
}

function loadContract(contractPath: string) {
  try {
    return parseContract(contractPath);
  } catch (err) {
    console.error(`Failed to parse contract: ${(err as Error).message}`);
    process.exitCode = 1;
    return undefined;
  }
}

async function runTestSuite(options: RunOptions, filter: string): Promise<number> {
  const args = buildTestArgs(options, filter);
  const cmd = args[0];
  const cmdArgs = args.slice(1);

  console.log(`[pratya] Running: ${cmd} ${cmdArgs.join(' ')}`);

  try {
    await execa(cmd, cmdArgs, { stdio: 'inherit' });
    return 0;
  } catch {
    return 1;
  }
}

function buildTestArgs(options: RunOptions, filter: string): string[] {
  switch (options.runner) {
    case 'vitest': {
      // Vitest doesn't support tag-based grep — run all tests,
      // the reporter collects traces only from tests calling spec()
      const args = ['npx', 'vitest', 'run'];
      if (options.coverage) {
        args.push('--coverage');
      }
      return args;
    }
    case 'playwright':
      return ['npx', 'playwright', 'test', '--grep', filter];
    case 'jest': {
      // Jest doesn't support tag-based grep either — run all tests
      const args = ['npx', 'jest'];
      if (options.coverage) {
        args.push('--coverage');
      }
      return args;
    }
  }
}
