import * as fs from 'node:fs';
import * as yaml from 'js-yaml';
import Ajv from 'ajv';
import type { ModuleContract, Spec, SpecStatus } from './model.js';

const contractSchema = {
  type: 'object',
  required: ['module', 'specs'],
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
    specs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'version', 'status', 'title', 'description', 'acceptance_criteria', 'cases', 'changelog'],
        properties: {
          id: { type: 'string', pattern: '^[A-Z][A-Z0-9_-]*-\\d{3}$' },
          version: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
          status: { type: 'string', enum: ['draft', 'approved', 'deprecated', 'superseded'] },
          title: { type: 'string', minLength: 1 },
          description: { type: 'string', minLength: 1 },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          supersedes: { type: 'string' },
          superseded_by: { type: 'string' },
          cases: {
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
    specs: Array<{
      id: string;
      version: string;
      status: SpecStatus;
      title: string;
      description: string;
      acceptance_criteria: string[];
      cases: Array<{ id: string; description: string }>;
      supersedes?: string;
      superseded_by?: string;
      changelog: Array<{ version: string; date: string; note: string }>;
    }>;
  };

  // Check for duplicate spec IDs
  const specIds = new Set<string>();
  const caseIds = new Set<string>();
  for (const spec of data.specs) {
    if (specIds.has(spec.id)) {
      throw new Error(`Duplicate spec ID '${spec.id}' in ${sourcePath}`);
    }
    specIds.add(spec.id);

    for (const c of spec.cases) {
      if (caseIds.has(c.id)) {
        throw new Error(`Duplicate case ID '${c.id}' in ${sourcePath}`);
      }
      caseIds.add(c.id);
    }
  }

  // Build lookup for supersession validation
  const allIds = new Set(data.specs.map(s => s.id));

  for (const spec of data.specs) {
    if (spec.superseded_by && !allIds.has(spec.superseded_by)) {
      throw new Error(
        `Spec '${spec.id}' has superseded_by '${spec.superseded_by}' which does not exist in ${sourcePath}`
      );
    }
    if (spec.supersedes && !allIds.has(spec.supersedes)) {
      throw new Error(
        `Spec '${spec.id}' has supersedes '${spec.supersedes}' which does not exist in ${sourcePath}`
      );
    }
  }

  const specs: Spec[] = data.specs.map(s => ({
    id: s.id,
    version: s.version,
    status: s.status,
    title: s.title,
    description: s.description,
    acceptanceCriteria: s.acceptance_criteria,
    cases: s.cases.map(c => ({ id: c.id, description: c.description })),
    supersedes: s.supersedes,
    supersededBy: s.superseded_by,
    changelog: s.changelog.map(c => ({ version: c.version, date: c.date, note: c.note })),
  }));

  return {
    moduleId: data.module.id,
    moduleName: data.module.name,
    description: data.module.description,
    owner: data.module.owner,
    created: data.module.created ?? '',
    version: data.module.version,
    specs,
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
