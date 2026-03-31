import * as fs from 'node:fs';

export function commentCommand(reportPath: string): void {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to read report: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const summary = raw.summary;
  if (!summary) {
    console.error('Report is missing summary section');
    process.exitCode = 1;
    return;
  }

  const lines: string[] = [
    '## Pratya Requirement Coverage',
    '',
    '| Metric | Value |',
    '|---|---|',
    `| Requirement Coverage | ${summary.requirementCoverage}% (${summary.coveredRequirements}/${summary.activeRequirements}) |`,
    `| Corner Case Coverage | ${summary.cornerCaseCoverage}% (${summary.coveredCornerCases}/${summary.totalCornerCases}) |`,
  ];

  if (summary.codeCoverage !== undefined) {
    lines.push(`| Code Coverage | ${summary.codeCoverage}% |`);
  }

  const violations = raw.violations ?? [];
  const errors = violations.filter((v: { severity: string }) => v.severity === 'ERROR');
  const warns = violations.filter((v: { severity: string }) => v.severity === 'WARN');

  if (errors.length > 0) {
    lines.push('');
    lines.push(`**${errors.length} error(s)**`);
    for (const e of errors) {
      lines.push(`- ${e.message}`);
    }
  }

  if (warns.length > 0) {
    lines.push('');
    lines.push(`**${warns.length} warning(s)**`);
    for (const w of warns) {
      lines.push(`- ${w.message}`);
    }
  }

  console.log(lines.join('\n'));
}
