import { parseContract } from '@intrigsoft/pratya-core';

export function validateCommand(contractPath: string): void {
  try {
    const contract = parseContract(contractPath);
    console.log(`✓ CONTRACT.yaml is valid — module '${contract.moduleId}' with ${contract.requirements.length} requirement(s)`);
  } catch (err) {
    console.error(`✗ Validation failed: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
