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
  .description('Run contract tests via Playwright')
  .option('--contract <path>', 'Path to CONTRACT.yaml', './CONTRACT.yaml')
  .option('--requirement <id>', 'Run tests for a specific requirement')
  .action(async (opts) => {
    await runCommand({ contract: opts.contract, requirement: opts.requirement });
  });

program
  .command('comment')
  .description('Generate a Markdown PR comment summary')
  .requiredOption('--report <path>', 'Path to pratya-report.json')
  .action((opts) => {
    commentCommand(opts.report);
  });

program.parse();
