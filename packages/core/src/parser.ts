import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import type { ModuleContract, Requirement, RequirementStatus } from './model.js';

const contractSchema = {
  type: 'object',
  required: ['module', 'requirements'],
  properties: {
    module: {
      type: 'object',
      required: ['id', 'name', 'description', 'version'],
      properties: {
        id: { type: 'string', pattern: '^[A-Z][A-Z0-9_-]*$' },
        name: { type: 'string', minLength: 1 },
        description: { type: 'string', minLength: 1 },
        owner: { type: 'string' },
        created: { type: 'string' },
        version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
      },
      additionalProperties: false,
    },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'version', 'status', 'title', 'description', 'acceptance_criteria', 'corner_cases', 'changelog'],
        properties: {
          id: { type: 'string', pattern: '^[A-Z][A-Z0-9_-]*-\\d{3}$' },
          version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
          status: { type: 'string', enum: ['draft', 'approved', 'deprecated', 'superseded'] },
          title: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          supersedes: { type: 'string' },
          superseded_by: { type: 'string' },
          corner_cases: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'description'],
              properties: {
                id: { type: 'string', pattern: '^[A-Z][A-Z0-9_-]*-\\d{3}-CC-\\d{3}$' },
                description: { type: 'string', minLength: 1 },
              },
              additionalProperties: false,
            },
          },
          changelog: {
            type: 'array',
            items: {
              type: 'object',
              required: ['version', 'date', 'note'],
              properties: {
                version: { type: 'string' },
                date: { type: 'string' },
                note: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

export function parseContract(contractPath: string): ModuleContract {
  const content = fs.readFileSync(contractPath, 'utf-8');
  return parseContractYaml(content, contractPath);
}

export function parseContractYaml(content: string, sourcePath: string = '<inline>'): ModuleContract {
  let raw: unknown;
  try {
    raw = yaml.load(content);
  } catch (err) {
    throw new Error(`Failed to parse YAML in ${sourcePath}: ${(err as Error).message}`);
  }

  if (raw === null || typeof raw !== 'object') {
    throw new Error(`CONTRACT.yaml at ${sourcePath} is empty or not an object`);
  }

  // js-yaml parses bare dates (e.g. 2026-03-06) as Date objects — coerce to ISO strings
  coerceDates(raw);

  const ajv = new Ajv({ allErrors: true });
  const validate = ajv.compile(contractSchema);
  if (!validate(raw)) {
    const errors = validate.errors!
      .map(e => `  ${e.instancePath || '/'}: ${e.message}`)
      .join('\n');
    throw new Error(`CONTRACT.yaml validation failed in ${sourcePath}:\n${errors}`);
  }

  const data = raw as {
    module: { id: string; name: string; description: string; owner?: string; created?: string; version: string };
    requirements: Array<{
      id: string;
      version: string;
      status: RequirementStatus;
      title: string;
      description: string;
      acceptance_criteria: string[];
      corner_cases: Array<{ id: string; description: string }>;
      supersedes?: string;
      superseded_by?: string;
      changelog: Array<{ version: string; date: string; note: string }>;
    }>;
  };

  // Check for duplicate requirement IDs
  const reqIds = new Set<string>();
  const ccIds = new Set<string>();
  for (const req of data.requirements) {
    if (reqIds.has(req.id)) {
      throw new Error(`Duplicate requirement ID '${req.id}' in ${sourcePath}`);
    }
    reqIds.add(req.id);

    for (const cc of req.corner_cases) {
      if (ccIds.has(cc.id)) {
        throw new Error(`Duplicate corner case ID '${cc.id}' in ${sourcePath}`);
      }
      ccIds.add(cc.id);
    }
  }

  // Build lookup for supersession validation
  const allIds = new Set(data.requirements.map(r => r.id));

  for (const req of data.requirements) {
    if (req.superseded_by && !allIds.has(req.superseded_by)) {
      throw new Error(
        `Requirement '${req.id}' has superseded_by '${req.superseded_by}' which does not exist in ${sourcePath}`
      );
    }
    if (req.supersedes && !allIds.has(req.supersedes)) {
      throw new Error(
        `Requirement '${req.id}' has supersedes '${req.supersedes}' which does not exist in ${sourcePath}`
      );
    }
  }

  const requirements: Requirement[] = data.requirements.map(r => ({
    id: r.id,
    version: r.version,
    status: r.status,
    title: r.title,
    description: r.description,
    acceptanceCriteria: r.acceptance_criteria,
    cornerCases: r.corner_cases.map(cc => ({ id: cc.id, description: cc.description })),
    supersedes: r.supersedes,
    supersededBy: r.superseded_by,
    changelog: r.changelog.map(c => ({ version: c.version, date: c.date, note: c.note })),
  }));

  return {
    moduleId: data.module.id,
    moduleName: data.module.name,
    description: data.module.description,
    owner: data.module.owner,
    created: data.module.created ?? '',
    version: data.module.version,
    requirements,
  };
}

function coerceDates(obj: unknown): void {
  if (obj === null || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach(coerceDates);
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (record[key] instanceof Date) {
      record[key] = (record[key] as Date).toISOString().split('T')[0];
    } else if (typeof record[key] === 'object' && record[key] !== null) {
      coerceDates(record[key]);
    }
  }
}
