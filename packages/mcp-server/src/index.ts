import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  parseContract,
  audit,
  computeCoverage,
  readTraces,
  addSpec,
  updateSpec,
  addCase,
  updateCase,
  deprecateSpec,
  supersedeSpec,
} from '@intrigsoft/pratya-core';
import type { ModuleContract, Spec, TraceEntry } from '@intrigsoft/pratya-core';

const DEFAULT_CONTRACT = './CONTRACT.yaml';

const server = new McpServer({
  name: 'pratya',
  version: '1.0.0',
}, {
  instructions: `You are working in a project that uses Contract-Driven Development (CDD) via Prathya.

CONTRACT.yaml is the single source of truth for what the system must do. Specs are first-class versioned artifacts. Tests are linked to specs via a spec() fixture.

Key rules:
- Spec IDs are permanent, immutable, and append-only ({MODULE}-{NNN})
- Case IDs follow {SPEC_ID}-CC-{NNN}
- Specs are never deleted — only deprecated or superseded
- Status lifecycle: draft → approved → deprecated/superseded
- Version bumps: major = breaking, minor = additive, patch = wording only
- Every approved spec should have at least one test
- Cases are first-class — each gets its own ID and coverage tracking

Use the tools below to read, modify, and audit the contract. Always check get_contract or list_specs before making changes.`,
});

// ─── READ TOOLS ───

server.tool(
  'get_contract',
  'Get the full contract — module metadata and all specs with statuses, acceptance criteria, cases, and changelog.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      const contract = parseContract(contract_file ?? DEFAULT_CONTRACT);
      const lines = [
        `Module: ${contract.moduleId} — ${contract.moduleName}`,
        `Description: ${contract.description}`,
        contract.owner ? `Owner: ${contract.owner}` : '',
        `Version: ${contract.version}`,
        `Specs: ${contract.specs.length}`,
        '',
      ].filter(Boolean);

      for (const spec of contract.specs) {
        lines.push(`${spec.id} [${spec.status.toUpperCase()}] ${spec.title} (v${spec.version})`);
        if (spec.supersededBy) lines.push(`  ↳ superseded by ${spec.supersededBy}`);
        if (spec.supersedes) lines.push(`  ↳ supersedes ${spec.supersedes}`);
        lines.push(`  ${spec.description.trim()}`);
        if (spec.acceptanceCriteria.length > 0) {
          lines.push('  Acceptance Criteria:');
          spec.acceptanceCriteria.forEach((ac, i) => lines.push(`    ${i + 1}. ${ac}`));
        }
        if (spec.cases.length > 0) {
          lines.push(`  Cases (${spec.cases.length}):`);
          spec.cases.forEach(cc => lines.push(`    ${cc.id}: ${cc.description}`));
        }
        lines.push('');
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'list_specs',
  'List specs, optionally filtered by lifecycle status (draft, approved, deprecated, superseded).',
  {
    status: z.enum(['draft', 'approved', 'deprecated', 'superseded']).optional().describe('Filter by status'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ status, contract_file }) => {
    return safeCall(() => {
      const contract = parseContract(contract_file ?? DEFAULT_CONTRACT);
      let specs = contract.specs;
      if (status) specs = specs.filter(r => r.status === status);

      const lines = [`${specs.length} spec(s)${status ? ` with status ${status}` : ''}:`, ''];
      for (const spec of specs) {
        const ccCount = spec.cases.length;
        lines.push(`${spec.id} [${spec.status.toUpperCase()}] ${spec.title}${ccCount > 0 ? ` (${ccCount} CC)` : ''}`);
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'get_spec',
  'Get full details of a single spec by ID, including acceptance criteria, cases, version history, and supersession chain.',
  {
    id: z.string().describe('Spec ID (e.g. AUTH-001) or case ID (e.g. AUTH-001-CC-001)'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ id, contract_file }) => {
    return safeCall(() => {
      const contract = parseContract(contract_file ?? DEFAULT_CONTRACT);
      const spec = findSpec(contract, id);

      const lines = [
        `ID: ${spec.id}`,
        `Title: ${spec.title}`,
        `Status: ${spec.status.toUpperCase()}`,
        `Version: ${spec.version}`,
        `Description: ${spec.description.trim()}`,
      ];

      if (spec.supersedes) lines.push(`Supersedes: ${spec.supersedes}`);
      if (spec.supersededBy) lines.push(`Superseded by: ${spec.supersededBy}`);

      if (spec.acceptanceCriteria.length > 0) {
        lines.push('', 'Acceptance Criteria:');
        spec.acceptanceCriteria.forEach((ac, i) => lines.push(`  ${i + 1}. ${ac}`));
      }

      if (spec.cases.length > 0) {
        lines.push('', 'Cases:');
        spec.cases.forEach(cc => lines.push(`  ${cc.id}: ${cc.description}`));
      }

      if (spec.changelog.length > 0) {
        lines.push('', 'Changelog:');
        spec.changelog.forEach(c => lines.push(`  v${c.version} (${c.date}): ${c.note}`));
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'list_untested',
  'List approved specs that have no mapped test. These are gaps in the contract.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      const contractPath = contract_file ?? DEFAULT_CONTRACT;
      const contract = parseContract(contractPath);
      const traces = loadTraces(contractPath);

      const coveredIds = new Set<string>();
      for (const t of traces) {
        for (const id of t.specIds) coveredIds.add(id);
      }

      const untested = contract.specs
        .filter(r => (r.status === 'approved' || r.status === 'draft') && !coveredIds.has(r.id));

      if (untested.length === 0) {
        return 'All approved/draft specs have at least one mapped test.';
      }

      const lines = [`${untested.length} untested spec(s):`, ''];
      for (const spec of untested) {
        lines.push(`${spec.id} [${spec.status.toUpperCase()}] ${spec.title}`);
        const untestedCCs = spec.cases.filter(cc => !coveredIds.has(cc.id));
        if (untestedCCs.length > 0) {
          untestedCCs.forEach(cc => lines.push(`  ${cc.id}: ${cc.description}`));
        }
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'get_coverage_matrix',
  'Get the full coverage matrix — a three-state view of every spec and case: covered+passing, covered+failing, or not covered.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      const contractPath = contract_file ?? DEFAULT_CONTRACT;
      const contract = parseContract(contractPath);
      const traces = loadTraces(contractPath);
      const matrix = computeCoverage(contract, traces);

      const lines = [
        `Coverage Matrix — ${contract.moduleId}`,
        `Spec Coverage: ${matrix.specCoverage}% (${matrix.specs.filter(r => r.covered).length}/${matrix.specs.length})`,
        `Case Coverage: ${matrix.caseCoverage}%`,
        `Passing Case Coverage: ${matrix.passingCaseCoverage}%`,
        '',
      ];

      for (const spec of matrix.specs) {
        const state = spec.passing === null ? 'NOT COVERED' : spec.passing ? 'PASSING' : 'FAILING';
        lines.push(`${spec.id} [${state}] ${spec.title}`);
        if (spec.tests.length > 0) {
          lines.push(`  Tests: ${spec.tests.map(t => t.title).join(', ')}`);
        }
        for (const cc of spec.cases) {
          const ccState = cc.passing === null ? 'NOT COVERED' : cc.passing ? 'PASSING' : 'FAILING';
          lines.push(`  ${cc.id} [${ccState}]`);
        }
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'run_audit',
  'Run the audit engine to detect contract violations: orphaned annotations, uncovered specs, deprecated references, and coverage gaps.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      const contractPath = contract_file ?? DEFAULT_CONTRACT;
      const contract = parseContract(contractPath);
      const traces = loadTraces(contractPath);
      const violations = audit(contract, traces);

      if (violations.length === 0) {
        return 'Audit passed — no violations detected.';
      }

      const lines = [`${violations.length} violation(s):`, ''];
      for (const v of violations) {
        lines.push(`[${v.severity}] ${v.type}: ${v.message}`);
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'validate_contract',
  'Validate CONTRACT.yaml for structural errors: malformed YAML, duplicate IDs, invalid statuses, broken supersession references.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      // parseContract already validates everything
      const contract = parseContract(contract_file ?? DEFAULT_CONTRACT);

      // Additional checks
      const issues: string[] = [];
      const ids = new Set<string>();
      for (const spec of contract.specs) {
        if (ids.has(spec.id)) issues.push(`Duplicate spec ID: ${spec.id}`);
        ids.add(spec.id);
        if (!spec.title.trim()) issues.push(`${spec.id}: empty title`);
        if (spec.status === 'superseded' && !spec.supersededBy) {
          issues.push(`${spec.id}: status is superseded but missing superseded_by`);
        }
        for (const cc of spec.cases) {
          if (ids.has(cc.id)) issues.push(`Duplicate case ID: ${cc.id}`);
          ids.add(cc.id);
        }
      }

      if (issues.length === 0) {
        return `Contract is valid — ${contract.specs.length} spec(s) in module ${contract.moduleId}.`;
      }

      return `${issues.length} issue(s):\n\n${issues.map(i => `- ${i}`).join('\n')}`;
    });
  },
);

server.tool(
  'configure_project',
  'Get step-by-step instructions for configuring Prathya in a JavaScript/TypeScript project.',
  {
    runner: z.enum(['vitest', 'playwright', 'jest']).optional().describe('Test runner to configure for. Defaults to vitest.'),
  },
  async ({ runner }) => {
    const r = runner ?? 'vitest';
    const lines = [
      '# Prathya Setup Guide',
      '',
      '## 1. Install dependencies',
      '',
    ];

    if (r === 'vitest') {
      lines.push(
        '```bash',
        'npm install -D @intrigsoft/pratya-vitest @intrigsoft/pratya-core @intrigsoft/pratya',
        '```',
        '',
        '## 2. Create CONTRACT.yaml',
        '',
        '```yaml',
        'module:',
        '  id: MYAPP',
        '  name: My Application',
        '  description: Application specs',
        '  version: 1.0.0',
        '',
        'specs:',
        '  - id: MYAPP-001',
        '    version: 1.0.0',
        '    status: approved',
        '    title: Example spec',
        '    description: The system must do X',
        '    acceptance_criteria:',
        '      - X happens when Y',
        '    cases: []',
        '    changelog:',
        '      - version: 1.0.0',
        '        date: "2026-01-01"',
        '        note: Initial definition',
        '```',
        '',
        '## 3. Configure vitest.config.ts',
        '',
        '```typescript',
        "import { defineConfig } from 'vitest/config';",
        '',
        'export default defineConfig({',
        '  test: {',
        '    coverage: {',
        "      provider: 'v8',",
        "      reporter: ['json-summary'],",
        "      reportsDirectory: './coverage',",
        '    },',
        '    reporters: [',
        "      'default',",
        "      ['@intrigsoft/pratya-vitest/reporter', {",
        "        contractPath: './CONTRACT.yaml',",
        "        outputDir: './pratya-report',",
        '      }],',
        '    ],',
        '  },',
        '});',
        '```',
        '',
        '## 4. Annotate tests',
        '',
        '```typescript',
        "import { test, expect } from '@intrigsoft/pratya-vitest';",
        '',
        "test('my feature works', ({ spec }) => {",
        "  spec('MYAPP-001');",
        '  // test body',
        '});',
        '```',
        '',
        '## 5. Run with Prathya',
        '',
        '```bash',
        'pratya run --runner vitest --coverage',
        '```',
      );
    } else if (r === 'playwright') {
      lines.push(
        '```bash',
        'npm install -D @intrigsoft/pratya-playwright @intrigsoft/pratya-core @intrigsoft/pratya',
        '```',
        '',
        '## 2. Create CONTRACT.yaml (same as vitest)',
        '',
        '## 3. Configure playwright.config.ts',
        '',
        '```typescript',
        "import { defineConfig } from '@playwright/test';",
        '',
        'export default defineConfig({',
        '  reporter: [',
        "    ['list'],",
        "    ['@intrigsoft/pratya-playwright/reporter', {",
        "      contractPath: './CONTRACT.yaml',",
        "      outputDir: './pratya-report',",
        '    }],',
        '  ],',
        '});',
        '```',
        '',
        '## 4. Annotate tests',
        '',
        '```typescript',
        "import { test, expect } from '@intrigsoft/pratya-playwright';",
        '',
        "test('my e2e test', async ({ page, spec }) => {",
        "  spec('MYAPP-001');",
        '  // test body',
        '});',
        '```',
        '',
        '## 5. Run',
        '',
        '```bash',
        'pratya run --runner playwright',
        '```',
      );
    } else {
      lines.push(
        '```bash',
        'npm install -D @intrigsoft/pratya-jest @intrigsoft/pratya-core @intrigsoft/pratya',
        '```',
        '',
        '## 2. Configure jest.config.js',
        '',
        '```javascript',
        'module.exports = {',
        "  reporters: ['default', ['@intrigsoft/pratya-jest/reporter', {",
        "    contractPath: './CONTRACT.yaml',",
        '  }]],',
        "  setupFilesAfterFramework: ['@intrigsoft/pratya-jest/setup'],",
        '};',
        '```',
        '',
        '## 3. Annotate tests',
        '',
        '```javascript',
        "const { spec } = require('@intrigsoft/pratya-jest');",
        '',
        "test('my test', () => {",
        "  spec('MYAPP-001');",
        '  // test body',
        '});',
        '```',
        '',
        '## 4. Run',
        '',
        '```bash',
        'pratya run --runner jest --coverage',
        '```',
      );
    }

    return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
  },
);

// ─── WRITE TOOLS ───

server.tool(
  'add_spec',
  'Add a new spec to the contract. New specs start as DRAFT by default. ID is auto-generated if not provided.',
  {
    title: z.string().describe('Concise statement of what the system must do'),
    id: z.string().optional().describe('Explicit ID following {MODULE}-{NNN} convention. Auto-generated if omitted.'),
    description: z.string().optional().describe('Detailed behavioral specification'),
    status: z.enum(['draft', 'approved']).optional().describe('Lifecycle status. Defaults to draft.'),
    acceptance_criteria: z.array(z.string()).optional().describe('Checkable proofs for testing'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ title, id, description, status, acceptance_criteria, contract_file }) => {
    return safeCall(() => {
      const spec = addSpec(contract_file ?? DEFAULT_CONTRACT, {
        id, title, description, status, acceptanceCriteria: acceptance_criteria,
      });
      return `Added spec ${spec.id} (${spec.title})`;
    });
  },
);

server.tool(
  'update_spec',
  'Update fields of an existing spec. Include a changelog note explaining what changed and why.',
  {
    id: z.string().describe('Spec ID to update. ID itself never changes.'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    version: z.string().optional().describe('New semver version (major=breaking, minor=additive, patch=wording)'),
    acceptance_criteria: z.array(z.string()).optional().describe('Replacement criteria'),
    note: z.string().optional().describe('Changelog entry explaining the change'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ id, title, description, version, acceptance_criteria, note, contract_file }) => {
    return safeCall(() => {
      updateSpec(contract_file ?? DEFAULT_CONTRACT, {
        id, title, description, version, acceptanceCriteria: acceptance_criteria, note,
      });
      return `Updated spec ${id}`;
    });
  },
);

server.tool(
  'add_case',
  'Add a case to a spec. Each gets its own ID and is independently tracked in coverage.',
  {
    spec_id: z.string().describe('Parent spec ID (e.g. AUTH-001)'),
    description: z.string().describe('Edge condition, error path, or boundary behavior'),
    id: z.string().optional().describe('Explicit case ID. Auto-generated if omitted.'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ spec_id, description, id, contract_file }) => {
    return safeCall(() => {
      const cc = addCase(contract_file ?? DEFAULT_CONTRACT, { specId: spec_id, description, id });
      return `Added case ${cc.id} to ${spec_id}`;
    });
  },
);

server.tool(
  'update_case',
  'Update the description of an existing case. IDs are permanent — if semantics change fundamentally, add a new case instead.',
  {
    spec_id: z.string().describe('Parent spec ID'),
    cc_id: z.string().describe('Case ID to update'),
    description: z.string().optional().describe('New description'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ spec_id, cc_id, description, contract_file }) => {
    return safeCall(() => {
      updateCase(contract_file ?? DEFAULT_CONTRACT, { specId: spec_id, ccId: cc_id, description });
      return `Updated case ${cc_id}`;
    });
  },
);

server.tool(
  'deprecate_spec',
  'Deprecate an APPROVED spec that is no longer relevant. Excluded from coverage metrics but kept for traceability.',
  {
    id: z.string().describe('Spec ID to deprecate. Only approved specs can be deprecated.'),
    reason: z.string().optional().describe('Why this spec is no longer relevant. Recorded in changelog.'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ id, reason, contract_file }) => {
    return safeCall(() => {
      deprecateSpec(contract_file ?? DEFAULT_CONTRACT, id, reason);
      return `Deprecated spec ${id}`;
    });
  },
);

server.tool(
  'supersede_spec',
  'Replace an existing spec with a new one. Old spec becomes SUPERSEDED with a reference to the replacement.',
  {
    old_id: z.string().describe('Spec ID to supersede'),
    title: z.string().describe('Title for the replacement spec'),
    new_id: z.string().optional().describe('Explicit ID for replacement. Auto-generated if omitted.'),
    description: z.string().optional().describe('Description for replacement'),
    acceptance_criteria: z.array(z.string()).optional().describe('Criteria for replacement'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ old_id, title, new_id, description, acceptance_criteria, contract_file }) => {
    return safeCall(() => {
      const spec = supersedeSpec(contract_file ?? DEFAULT_CONTRACT, old_id, {
        newId: new_id, title, description, acceptanceCriteria: acceptance_criteria,
      });
      return `Superseded ${old_id} with ${spec.id} (${spec.title})`;
    });
  },
);

// ─── Helpers ───

function safeCall(fn: () => string): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  try {
    return { content: [{ type: 'text', text: fn() }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${(err as Error).message}` }], isError: true };
  }
}

function findSpec(contract: ModuleContract, id: string): Spec {
  // Check if it's a case ID — find the parent spec
  const ccMatch = id.match(/^(.+)-CC-\d+$/);
  if (ccMatch) {
    const parentId = ccMatch[1];
    const spec = contract.specs.find(r => r.id === parentId);
    if (spec) return spec;
  }

  const spec = contract.specs.find(r => r.id === id);
  if (!spec) throw new Error(`Spec '${id}' not found`);
  return spec;
}

function loadTraces(contractPath: string): TraceEntry[] {
  // Look for traces in the default pratya-report directory relative to the contract
  const dir = contractPath.replace(/CONTRACT\.yaml$/i, '') || '.';
  const candidates = [
    `${dir}pratya-report`,
    './pratya-report',
  ];

  for (const candidate of candidates) {
    const traces = readTraces(candidate);
    if (traces.length > 0) return traces;
  }

  return [];
}

// ─── Start ───

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
