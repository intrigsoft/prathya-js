import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import type {
  ModuleContract,
  Spec,
  Case,
  SpecStatus,
  ChangelogEntry,
} from './model.js';
import { parseContract } from './parser.js';

/**
 * Load a CONTRACT.yaml, apply a mutation, and write it back.
 * All mutations are append-only — IDs are never reused or deleted.
 */

export interface AddSpecInput {
  id?: string;
  title: string;
  description?: string;
  status?: SpecStatus;
  acceptanceCriteria?: string[];
}

export interface UpdateSpecInput {
  id: string;
  title?: string;
  description?: string;
  version?: string;
  acceptanceCriteria?: string[];
  note?: string;
}

export interface AddCaseInput {
  specId: string;
  id?: string;
  description: string;
}

export interface UpdateCaseInput {
  specId: string;
  caseId: string;
  description?: string;
}

export function addSpec(contractPath: string, input: AddSpecInput): Spec {
  const raw = loadRawYaml(contractPath);
  const contract = parseContract(contractPath);

  const id = input.id ?? generateSpecId(contract);
  const now = new Date().toISOString().split('T')[0];

  const newSpec = {
    id,
    version: '1.0.0',
    status: input.status ?? 'draft',
    title: input.title,
    description: input.description ?? '',
    acceptance_criteria: input.acceptanceCriteria ?? [],
    cases: [] as Array<{ id: string; description: string }>,
    changelog: [{ version: '1.0.0', date: now, note: 'Initial definition' }],
  };

  raw.specs.push(newSpec);
  writeRawYaml(contractPath, raw);

  return {
    id,
    version: '1.0.0',
    status: (input.status ?? 'draft') as SpecStatus,
    title: input.title,
    description: input.description ?? '',
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    cases: [],
    changelog: [{ version: '1.0.0', date: now, note: 'Initial definition' }],
  };
}

export function updateSpec(contractPath: string, input: UpdateSpecInput): void {
  const raw = loadRawYaml(contractPath);
  const spec = raw.specs.find(s => s.id === input.id);
  if (!spec) throw new Error(`Spec '${input.id}' not found`);

  if (input.title) spec.title = input.title;
  if (input.description) spec.description = input.description;
  if (input.acceptanceCriteria) spec.acceptance_criteria = input.acceptanceCriteria;
  if (input.version) {
    spec.version = input.version;
    const now = new Date().toISOString().split('T')[0];
    spec.changelog.push({ version: input.version, date: now, note: input.note ?? 'Updated' });
  } else if (input.note) {
    const now = new Date().toISOString().split('T')[0];
    spec.changelog.push({ version: spec.version, date: now, note: input.note });
  }

  writeRawYaml(contractPath, raw);
}

export function addCase(contractPath: string, input: AddCaseInput): Case {
  const raw = loadRawYaml(contractPath);
  const spec = raw.specs.find(s => s.id === input.specId);
  if (!spec) throw new Error(`Spec '${input.specId}' not found`);

  const id = input.id ?? generateCaseId(spec);

  const c = { id, description: input.description };
  spec.cases.push(c);
  writeRawYaml(contractPath, raw);

  return { id, description: input.description };
}

export function updateCase(contractPath: string, input: UpdateCaseInput): void {
  const raw = loadRawYaml(contractPath);
  const spec = raw.specs.find(s => s.id === input.specId);
  if (!spec) throw new Error(`Spec '${input.specId}' not found`);

  const c = spec.cases.find(c => c.id === input.caseId);
  if (!c) throw new Error(`Case '${input.caseId}' not found in '${input.specId}'`);

  if (input.description) c.description = input.description;

  writeRawYaml(contractPath, raw);
}

export function deprecateSpec(contractPath: string, id: string, reason?: string): void {
  const raw = loadRawYaml(contractPath);
  const spec = raw.specs.find(s => s.id === id);
  if (!spec) throw new Error(`Spec '${id}' not found`);
  if (spec.status !== 'approved') throw new Error(`Only approved specs can be deprecated (current: ${spec.status})`);

  spec.status = 'deprecated';
  const now = new Date().toISOString().split('T')[0];
  spec.changelog.push({ version: spec.version, date: now, note: reason ?? 'Deprecated' });

  writeRawYaml(contractPath, raw);
}

export function supersedeSpec(
  contractPath: string,
  oldId: string,
  input: { newId?: string; title: string; description?: string; acceptanceCriteria?: string[] },
): Spec {
  const raw = loadRawYaml(contractPath);
  const contract = parseContract(contractPath);

  const oldSpec = raw.specs.find(s => s.id === oldId);
  if (!oldSpec) throw new Error(`Spec '${oldId}' not found`);

  const newId = input.newId ?? generateSpecId(contract);
  const now = new Date().toISOString().split('T')[0];

  // Mark old as superseded
  oldSpec.status = 'superseded';
  oldSpec.superseded_by = newId;
  oldSpec.changelog.push({ version: oldSpec.version, date: now, note: `Superseded by ${newId}` });

  // Create new spec
  const newSpec = {
    id: newId,
    version: '1.0.0',
    status: 'approved',
    supersedes: oldId,
    title: input.title,
    description: input.description ?? '',
    acceptance_criteria: input.acceptanceCriteria ?? [],
    cases: [] as Array<{ id: string; description: string }>,
    changelog: [{ version: '1.0.0', date: now, note: `Supersedes ${oldId}` }],
  };

  raw.specs.push(newSpec);
  writeRawYaml(contractPath, raw);

  return {
    id: newId,
    version: '1.0.0',
    status: 'approved',
    supersedes: oldId,
    title: input.title,
    description: input.description ?? '',
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    cases: [],
    changelog: [{ version: '1.0.0', date: now, note: `Supersedes ${oldId}` }],
  };
}

// --- Helpers ---

interface RawCase {
  id: string;
  description: string;
  [key: string]: unknown;
}

interface RawChangelogEntry {
  version: string;
  date: string;
  note: string;
}

interface RawSpec {
  id: string;
  version: string;
  status: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  cases: RawCase[];
  changelog: RawChangelogEntry[];
  supersedes?: string;
  superseded_by?: string;
  [key: string]: unknown;
}

interface RawContract {
  module: Record<string, unknown>;
  specs: RawSpec[];
  [key: string]: unknown;
}

function loadRawYaml(contractPath: string): RawContract {
  const content = fs.readFileSync(contractPath, 'utf-8');
  const raw = yaml.load(content) as Record<string, unknown>;
  if (!raw || !Array.isArray(raw.specs)) {
    throw new Error(`Invalid CONTRACT.yaml at ${contractPath}`);
  }
  return raw as unknown as RawContract;
}

function writeRawYaml(contractPath: string, data: RawContract): void {
  const content = yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
    forceQuotes: false,
  });
  fs.writeFileSync(contractPath, content, 'utf-8');
}

function generateSpecId(contract: ModuleContract): string {
  const prefix = contract.moduleId;
  const existingNums = contract.specs
    .map(s => {
      const match = s.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function generateCaseId(spec: RawSpec): string {
  const specId = spec.id;
  const cases = spec.cases ?? [];
  const existingNums = cases
    .map(c => {
      const match = c.id.match(/-CC-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  return `${specId}-CC-${String(next).padStart(3, '0')}`;
}
