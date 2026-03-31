import { parseContract } from '@pratya/core';
import { execa } from 'execa';

export async function runCommand(options: {
  contract: string;
  requirement?: string;
}): Promise<void> {
  let filter: string;

  if (options.requirement) {
    filter = `@requirement:${options.requirement}`;
  } else {
    let contract;
    try {
      contract = parseContract(options.contract);
    } catch (err) {
      console.error(`Failed to parse contract: ${(err as Error).message}`);
      process.exitCode = 1;
      return;
    }

    const approvedIds = contract.requirements
      .filter(r => r.status === 'approved')
      .map(r => r.id);

    if (approvedIds.length === 0) {
      console.log('No approved requirements found in CONTRACT.yaml');
      return;
    }

    filter = `@requirement:(${approvedIds.join('|')})`;
  }

  console.log(`Running: npx playwright test --grep "${filter}"`);

  try {
    await execa('npx', ['playwright', 'test', '--grep', filter], {
      stdio: 'inherit',
    });
  } catch (err) {
    // execa throws on non-zero exit — Playwright sets exit code on failures
    process.exitCode = 1;
  }
}
