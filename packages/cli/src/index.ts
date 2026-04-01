import { Command } from 'commander';
import { validateCommand } from './commands/validate.js';
import { auditCommand } from './commands/audit.js';
import { runCommand } from './commands/run.js';
import { commentCommand } from './commands/comment.js';

const program = new Command();

program
  .name('pratya')
  .description('Requirement coverage and traceability CLI')
  .version('0.3.0');

program
  .command('validate')
  .description('Parse and validate CONTRACT.yaml')
  .option('--contract <path>', 'Path to CONTRACT.yaml', './CONTRACT.yaml')
  .action((opts) => {
    validateCommand(opts.contract);
  });

program
  .command('audit')
  .description('Run audit rules and report violations')
  .option('--contract <path>', 'Path to CONTRACT.yaml', './CONTRACT.yaml')
  .option('--report <path>', 'Path to pratya-report.json for staleness check')
  .action((opts) => {
    auditCommand({ contract: opts.contract, report: opts.report });
  });

program
  .command('run')
  .description('Run contract tests and generate coverage report')
  .option('--contract <path>', 'Path to CONTRACT.yaml', './CONTRACT.yaml')
  .option('--requirement <id>', 'Run tests for a specific requirement')
  .option('--runner <type>', 'Test runner: vitest, playwright, jest', 'vitest')
  .option('--output-dir <path>', 'Output directory for reports', './pratya-report')
  .option('--coverage', 'Enable code coverage collection')
  .option('--coverage-summary <path>', 'Path to Istanbul coverage-summary.json')
  .option('--fail-on-violations', 'Exit 1 if any ERROR violations')
  .option('--min-coverage <n>', 'Minimum requirement coverage threshold (0-100)', '0')
  .action(async (opts) => {
    await runCommand({
      contract: opts.contract,
      requirement: opts.requirement,
      runner: opts.runner,
      outputDir: opts.outputDir,
      coverage: opts.coverage,
      coverageSummary: opts.coverageSummary,
      failOnViolations: opts.failOnViolations,
      minimumRequirementCoverage: parseInt(opts.minCoverage, 10),
    });
  });

program
  .command('comment')
  .description('Generate a Markdown PR comment summary')
  .requiredOption('--report <path>', 'Path to pratya-report.json')
  .action((opts) => {
    commentCommand(opts.report);
  });

program.parse();
