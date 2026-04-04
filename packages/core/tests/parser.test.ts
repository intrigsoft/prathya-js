import { describe } from 'vitest';
import { test, expect } from '@intrigsoft/pratya-vitest';
import * as path from 'node:path';
import { parseContract, parseContractYaml } from '../src/parser.js';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures');

describe('parseContract', () => {
  test('parses a valid CONTRACT.yaml', ({ spec }) => {
    spec('PRATYA-001');
    const contract = parseContract(path.join(FIXTURE_DIR, 'valid-contract.yaml'));
    expect(contract.moduleId).toBe('AUTH');
    expect(contract.moduleName).toBe('Authentication Module');
    expect(contract.version).toBe('1.2.0');
    expect(contract.specs).toHaveLength(4);
  });

  test('maps spec fields correctly', ({ spec }) => {
    spec('PRATYA-001');
    const contract = parseContract(path.join(FIXTURE_DIR, 'valid-contract.yaml'));
    const auth001 = contract.specs.find(s => s.id === 'AUTH-001')!;
    expect(auth001.version).toBe('1.1.0');
    expect(auth001.status).toBe('approved');
    expect(auth001.title).toBe('User login with email and password');
    expect(auth001.acceptanceCriteria).toHaveLength(2);
    expect(auth001.cases).toHaveLength(3);
    expect(auth001.changelog).toHaveLength(2);
  });

  test('maps supersession fields', ({ spec }) => {
    spec('PRATYA-001');
    const contract = parseContract(path.join(FIXTURE_DIR, 'valid-contract.yaml'));
    const auth003 = contract.specs.find(s => s.id === 'AUTH-003')!;
    expect(auth003.status).toBe('superseded');
    expect(auth003.supersededBy).toBe('AUTH-005');

    const auth005 = contract.specs.find(s => s.id === 'AUTH-005')!;
    expect(auth005.supersedes).toBe('AUTH-003');
  });

  test('rejects invalid YAML', ({ spec }) => {
    spec('PRATYA-001-CC-001');
    expect(() => parseContractYaml('{{{', 'test.yaml')).toThrow('Failed to parse YAML');
  });

  test('rejects non-object YAML', ({ spec }) => {
    spec('PRATYA-001-CC-002');
    expect(() => parseContractYaml(':::invalid', 'test.yaml')).toThrow('empty or not an object');
  });

  test('rejects empty content', ({ spec }) => {
    spec('PRATYA-001-CC-002');
    expect(() => parseContractYaml('', 'test.yaml')).toThrow('empty or not an object');
  });

  test('accepts empty specs list', ({ spec }) => {
    spec('PRATYA-001-CC-003');
    const yaml = `
module:
  id: AUTH
  name: Auth
  description: Test
  version: 1.0.0
specs: []
`;
    const contract = parseContractYaml(yaml);
    expect(contract.specs).toHaveLength(0);
  });

  test('rejects malformed spec IDs', ({ spec }) => {
    spec('PRATYA-001-CC-004');
    const yaml = `
module:
  id: AUTH
  name: Auth
  description: Test
  version: 1.0.0
specs:
  - id: bad-id
    version: 1.0.0
    status: approved
    title: Test
    description: Test
    acceptance_criteria: []
    cases: []
    changelog: []
`;
    expect(() => parseContractYaml(yaml)).toThrow('validation failed');
  });

  test('rejects duplicate spec IDs', ({ spec }) => {
    spec('PRATYA-001-CC-005');
    const yaml = `
module:
  id: AUTH
  name: Auth
  description: Test
  version: 1.0.0
specs:
  - id: AUTH-001
    version: 1.0.0
    status: approved
    title: Test
    description: Test
    acceptance_criteria: []
    cases: []
    changelog: []
  - id: AUTH-001
    version: 1.0.0
    status: approved
    title: Duplicate
    description: Test
    acceptance_criteria: []
    cases: []
    changelog: []
`;
    expect(() => parseContractYaml(yaml)).toThrow("Duplicate spec ID 'AUTH-001'");
  });

  test('rejects broken superseded_by reference', ({ spec }) => {
    spec('PRATYA-001-CC-006');
    const yaml = `
module:
  id: AUTH
  name: Auth
  description: Test
  version: 1.0.0
specs:
  - id: AUTH-001
    version: 1.0.0
    status: superseded
    superseded_by: AUTH-999
    title: Test
    description: Test
    acceptance_criteria: []
    cases: []
    changelog: []
`;
    expect(() => parseContractYaml(yaml)).toThrow("superseded_by 'AUTH-999' which does not exist");
  });

  test('rejects broken supersedes reference', ({ spec }) => {
    spec('PRATYA-001-CC-007');
    const yaml = `
module:
  id: AUTH
  name: Auth
  description: Test
  version: 1.0.0
specs:
  - id: AUTH-001
    version: 1.0.0
    status: approved
    supersedes: AUTH-999
    title: Test
    description: Test
    acceptance_criteria: []
    cases: []
    changelog: []
`;
    expect(() => parseContractYaml(yaml)).toThrow("supersedes 'AUTH-999' which does not exist");
  });
});
