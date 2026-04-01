import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import type {
  ModuleContract,
  Requirement,
  CornerCase,
  RequirementStatus,
  ChangelogEntry,
} from './model.js';
import { parseContract } from './parser.js';

/**
 * Load a CONTRACT.yaml, apply a mutation, and write it back.
 * All mutations are append-only — IDs are never reused or deleted.
 */

export interface AddRequirementInput {
  id?: string;
  title: string;
  description?: string;
  status?: RequirementStatus;
  acceptanceCriteria?: string[];
}

export interface UpdateRequirementInput {
  id: string;
  title?: string;
  description?: string;
  version?: string;
  acceptanceCriteria?: string[];
  note?: string;
}

export interface AddCornerCaseInput {
  reqId: string;
  id?: string;
  description: string;
}

export interface UpdateCornerCaseInput {
  reqId: string;
  ccId: string;
  description?: string;
}

export function addRequirement(contractPath: string, input: AddRequirementInput): Requirement {
  const raw = loadRawYaml(contractPath);
  const contract = parseContract(contractPath);

  const id = input.id ?? generateRequirementId(contract);
  const now = new Date().toISOString().split('T')[0];

  const newReq = {
    id,
    version: '1.0.0',
    status: input.status ?? 'draft',
    title: input.title,
    description: input.description ?? '',
    acceptance_criteria: input.acceptanceCriteria ?? [],
    corner_cases: [] as Array<{ id: string; description: string }>,
    changelog: [{ version: '1.0.0', date: now, note: 'Initial definition' }],
  };

  raw.requirements.push(newReq);
  writeRawYaml(contractPath, raw);

  return {
    id,
    version: '1.0.0',
    status: (input.status ?? 'draft') as RequirementStatus,
    title: input.title,
    description: input.description ?? '',
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    cornerCases: [],
    changelog: [{ version: '1.0.0', date: now, note: 'Initial definition' }],
  };
}

export function updateRequirement(contractPath: string, input: UpdateRequirementInput): void {
  const raw = loadRawYaml(contractPath);
  const req = raw.requirements.find(r => r.id === input.id);
  if (!req) throw new Error(`Requirement '${input.id}' not found`);

  if (input.title) req.title = input.title;
  if (input.description) req.description = input.description;
  if (input.acceptanceCriteria) req.acceptance_criteria = input.acceptanceCriteria;
  if (input.version) {
    req.version = input.version;
    const now = new Date().toISOString().split('T')[0];
    req.changelog.push({ version: input.version, date: now, note: input.note ?? 'Updated' });
  } else if (input.note) {
    const now = new Date().toISOString().split('T')[0];
    req.changelog.push({ version: req.version, date: now, note: input.note });
  }

  writeRawYaml(contractPath, raw);
}

export function addCornerCase(contractPath: string, input: AddCornerCaseInput): CornerCase {
  const raw = loadRawYaml(contractPath);
  const req = raw.requirements.find(r => r.id === input.reqId);
  if (!req) throw new Error(`Requirement '${input.reqId}' not found`);

  const id = input.id ?? generateCornerCaseId(req);

  const cc = { id, description: input.description };
  req.corner_cases.push(cc);
  writeRawYaml(contractPath, raw);

  return { id, description: input.description };
}

export function updateCornerCase(contractPath: string, input: UpdateCornerCaseInput): void {
  const raw = loadRawYaml(contractPath);
  const req = raw.requirements.find(r => r.id === input.reqId);
  if (!req) throw new Error(`Requirement '${input.reqId}' not found`);

  const cc = req.corner_cases.find(c => c.id === input.ccId);
  if (!cc) throw new Error(`Corner case '${input.ccId}' not found in '${input.reqId}'`);

  if (input.description) cc.description = input.description;

  writeRawYaml(contractPath, raw);
}

export function deprecateRequirement(contractPath: string, id: string, reason?: string): void {
  const raw = loadRawYaml(contractPath);
  const req = raw.requirements.find(r => r.id === id);
  if (!req) throw new Error(`Requirement '${id}' not found`);
  if (req.status !== 'approved') throw new Error(`Only approved requirements can be deprecated (current: ${req.status})`);

  req.status = 'deprecated';
  const now = new Date().toISOString().split('T')[0];
  req.changelog.push({ version: req.version, date: now, note: reason ?? 'Deprecated' });

  writeRawYaml(contractPath, raw);
}

export function supersedeRequirement(
  contractPath: string,
  oldId: string,
  input: { newId?: string; title: string; description?: string; acceptanceCriteria?: string[] },
): Requirement {
  const raw = loadRawYaml(contractPath);
  const contract = parseContract(contractPath);

  const oldReq = raw.requirements.find(r => r.id === oldId);
  if (!oldReq) throw new Error(`Requirement '${oldId}' not found`);

  const newId = input.newId ?? generateRequirementId(contract);
  const now = new Date().toISOString().split('T')[0];

  // Mark old as superseded
  oldReq.status = 'superseded';
  oldReq.superseded_by = newId;
  oldReq.changelog.push({ version: oldReq.version, date: now, note: `Superseded by ${newId}` });

  // Create new requirement
  const newReq = {
    id: newId,
    version: '1.0.0',
    status: 'approved',
    supersedes: oldId,
    title: input.title,
    description: input.description ?? '',
    acceptance_criteria: input.acceptanceCriteria ?? [],
    corner_cases: [] as Array<{ id: string; description: string }>,
    changelog: [{ version: '1.0.0', date: now, note: `Supersedes ${oldId}` }],
  };

  raw.requirements.push(newReq);
  writeRawYaml(contractPath, raw);

  return {
    id: newId,
    version: '1.0.0',
    status: 'approved',
    supersedes: oldId,
    title: input.title,
    description: input.description ?? '',
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    cornerCases: [],
    changelog: [{ version: '1.0.0', date: now, note: `Supersedes ${oldId}` }],
  };
}

// --- Helpers ---

interface RawCornerCase {
  id: string;
  description: string;
  [key: string]: unknown;
}

interface RawChangelogEntry {
  version: string;
  date: string;
  note: string;
}

interface RawRequirement {
  id: string;
  version: string;
  status: string;
  title: string;
  description: string;
  acceptance_criteria: string[];
  corner_cases: RawCornerCase[];
  changelog: RawChangelogEntry[];
  supersedes?: string;
  superseded_by?: string;
  [key: string]: unknown;
}

interface RawContract {
  module: Record<string, unknown>;
  requirements: RawRequirement[];
  [key: string]: unknown;
}

function loadRawYaml(contractPath: string): RawContract {
  const content = fs.readFileSync(contractPath, 'utf-8');
  const raw = yaml.load(content) as Record<string, unknown>;
  if (!raw || !Array.isArray(raw.requirements)) {
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

function generateRequirementId(contract: ModuleContract): string {
  const prefix = contract.moduleId;
  const existingNums = contract.requirements
    .map(r => {
      const match = r.id.match(new RegExp(`^${prefix}-(\\d+)$`));
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function generateCornerCaseId(req: RawRequirement): string {
  const reqId = req.id;
  const ccs = req.corner_cases ?? [];
  const existingNums = ccs
    .map(cc => {
      const match = cc.id.match(/-CC-(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter(n => n > 0);
  const next = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
  return `${reqId}-CC-${String(next).padStart(3, '0')}`;
}
