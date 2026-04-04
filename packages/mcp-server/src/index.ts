import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  parseContract,
  audit,
  computeCoverage,
  readTraces,
  addRequirement,
  updateRequirement,
  addCornerCase,
  updateCornerCase,
  deprecateRequirement,
  supersedeRequirement,
} from '@intrigsoft/pratya-core';
import type { ModuleContract, Requirement, TraceEntry } from '@intrigsoft/pratya-core';

const DEFAULT_CONTRACT = './CONTRACT.yaml';

const server = new McpServer({
  name: 'pratya',
  version: '1.0.0',
}, {
  instructions: `You are working in a project that uses Contract-Driven Development (CDD) via Prathya.

CONTRACT.yaml is the single source of truth for what the system must do. Requirements are first-class versioned artifacts. Tests are linked to requirements via a requirement() fixture.

Key rules:
- Requirement IDs are permanent, immutable, and append-only ({MODULE}-{NNN})
- Corner case IDs follow {REQ_ID}-CC-{NNN}
- Requirements are never deleted — only deprecated or superseded
- Status lifecycle: draft → approved → deprecated/superseded
- Version bumps: major = breaking, minor = additive, patch = wording only
- Every approved requirement should have at least one test
- Corner cases are first-class — each gets its own ID and coverage tracking

Use the tools below to read, modify, and audit the contract. Always check get_contract or list_requirements before making changes.`,
});

// ─── READ TOOLS ───

server.tool(
  'get_contract',
  'Get the full contract — module metadata and all requirements with statuses, acceptance criteria, corner cases, and changelog.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      const contract = parseContract(contract_file ?? DEFAULT_CONTRACT);
      const lines = [
        `Module: ${contract.moduleId} — ${contract.moduleName}`,
        `Description: ${contract.description}`,
        contract.owner ? `Owner: ${contract.owner}` : '',
        `Version: ${contract.version}`,
        `Requirements: ${contract.requirements.length}`,
        '',
      ].filter(Boolean);

      for (const req of contract.requirements) {
        lines.push(`${req.id} [${req.status.toUpperCase()}] ${req.title} (v${req.version})`);
        if (req.supersededBy) lines.push(`  ↳ superseded by ${req.supersededBy}`);
        if (req.supersedes) lines.push(`  ↳ supersedes ${req.supersedes}`);
        lines.push(`  ${req.description.trim()}`);
        if (req.acceptanceCriteria.length > 0) {
          lines.push('  Acceptance Criteria:');
          req.acceptanceCriteria.forEach((ac, i) => lines.push(`    ${i + 1}. ${ac}`));
        }
        if (req.cornerCases.length > 0) {
          lines.push(`  Corner Cases (${req.cornerCases.length}):`);
          req.cornerCases.forEach(cc => lines.push(`    ${cc.id}: ${cc.description}`));
        }
        lines.push('');
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'list_requirements',
  'List requirements, optionally filtered by lifecycle status (draft, approved, deprecated, superseded).',
  {
    status: z.enum(['draft', 'approved', 'deprecated', 'superseded']).optional().describe('Filter by status'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ status, contract_file }) => {
    return safeCall(() => {
      const contract = parseContract(contract_file ?? DEFAULT_CONTRACT);
      let reqs = contract.requirements;
      if (status) reqs = reqs.filter(r => r.status === status);

      const lines = [`${reqs.length} requirement(s)${status ? ` with status ${status}` : ''}:`, ''];
      for (const req of reqs) {
        const ccCount = req.cornerCases.length;
        lines.push(`${req.id} [${req.status.toUpperCase()}] ${req.title}${ccCount > 0 ? ` (${ccCount} CC)` : ''}`);
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'get_requirement',
  'Get full details of a single requirement by ID, including acceptance criteria, corner cases, version history, and supersession chain.',
  {
    id: z.string().describe('Requirement ID (e.g. AUTH-001) or corner case ID (e.g. AUTH-001-CC-001)'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ id, contract_file }) => {
    return safeCall(() => {
      const contract = parseContract(contract_file ?? DEFAULT_CONTRACT);
      const req = findRequirement(contract, id);

      const lines = [
        `ID: ${req.id}`,
        `Title: ${req.title}`,
        `Status: ${req.status.toUpperCase()}`,
        `Version: ${req.version}`,
        `Description: ${req.description.trim()}`,
      ];

      if (req.supersedes) lines.push(`Supersedes: ${req.supersedes}`);
      if (req.supersededBy) lines.push(`Superseded by: ${req.supersededBy}`);

      if (req.acceptanceCriteria.length > 0) {
        lines.push('', 'Acceptance Criteria:');
        req.acceptanceCriteria.forEach((ac, i) => lines.push(`  ${i + 1}. ${ac}`));
      }

      if (req.cornerCases.length > 0) {
        lines.push('', 'Corner Cases:');
        req.cornerCases.forEach(cc => lines.push(`  ${cc.id}: ${cc.description}`));
      }

      if (req.changelog.length > 0) {
        lines.push('', 'Changelog:');
        req.changelog.forEach(c => lines.push(`  v${c.version} (${c.date}): ${c.note}`));
      }

      return lines.join('\n');
    });
  },
);

server.tool(
  'list_untested',
  'List approved requirements that have no mapped test. These are gaps in the contract.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      const contractPath = contract_file ?? DEFAULT_CONTRACT;
      const contract = parseContract(contractPath);
      const traces = loadTraces(contractPath);

      const coveredIds = new Set<string>();
      for (const t of traces) {
        for (const id of t.requirementIds) coveredIds.add(id);
      }

      const untested = contract.requirements
        .filter(r => (r.status === 'approved' || r.status === 'draft') && !coveredIds.has(r.id));

      if (untested.length === 0) {
        return 'All approved/draft requirements have at least one mapped test.';
      }

      const lines = [`${untested.length} untested requirement(s):`, ''];
      for (const req of untested) {
        lines.push(`${req.id} [${req.status.toUpperCase()}] ${req.title}`);
        const untestedCCs = req.cornerCases.filter(cc => !coveredIds.has(cc.id));
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
  'Get the full coverage matrix — a three-state view of every requirement and corner case: covered+passing, covered+failing, or not covered.',
  { contract_file: z.string().optional().describe('Path to CONTRACT.yaml') },
  async ({ contract_file }) => {
    return safeCall(() => {
      const contractPath = contract_file ?? DEFAULT_CONTRACT;
      const contract = parseContract(contractPath);
      const traces = loadTraces(contractPath);
      const matrix = computeCoverage(contract, traces);

      const lines = [
        `Coverage Matrix — ${contract.moduleId}`,
        `Requirement Coverage: ${matrix.requirementCoverage}% (${matrix.requirements.filter(r => r.covered).length}/${matrix.requirements.length})`,
        `Corner Case Coverage: ${matrix.cornerCaseCoverage}%`,
        '',
      ];

      for (const req of matrix.requirements) {
        const state = req.passing === null ? 'NOT COVERED' : req.passing ? 'PASSING' : 'FAILING';
        lines.push(`${req.id} [${state}] ${req.title}`);
        if (req.tests.length > 0) {
          lines.push(`  Tests: ${req.tests.map(t => t.title).join(', ')}`);
        }
        for (const cc of req.cornerCases) {
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
  'Run the audit engine to detect contract violations: orphaned annotations, uncovered requirements, deprecated references, and coverage gaps.',
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
      for (const req of contract.requirements) {
        if (ids.has(req.id)) issues.push(`Duplicate requirement ID: ${req.id}`);
        ids.add(req.id);
        if (!req.title.trim()) issues.push(`${req.id}: empty title`);
        if (req.status === 'superseded' && !req.supersededBy) {
          issues.push(`${req.id}: status is superseded but missing superseded_by`);
        }
        for (const cc of req.cornerCases) {
          if (ids.has(cc.id)) issues.push(`Duplicate corner case ID: ${cc.id}`);
          ids.add(cc.id);
        }
      }

      if (issues.length === 0) {
        return `Contract is valid — ${contract.requirements.length} requirement(s) in module ${contract.moduleId}.`;
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
        '  description: Application requirements',
        '  version: 1.0.0',
        '',
        'requirements:',
        '  - id: MYAPP-001',
        '    version: 1.0.0',
        '    status: approved',
        '    title: Example requirement',
        '    description: The system must do X',
        '    acceptance_criteria:',
        '      - X happens when Y',
        '    corner_cases: []',
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
        "test('my feature works', ({ requirement }) => {",
        "  requirement('MYAPP-001');",
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
        "test('my e2e test', async ({ page, requirement }) => {",
        "  requirement('MYAPP-001');",
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
        "const { requirement } = require('@intrigsoft/pratya-jest');",
        '',
        "test('my test', () => {",
        "  requirement('MYAPP-001');",
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
  'add_requirement',
  'Add a new requirement to the contract. New requirements start as DRAFT by default. ID is auto-generated if not provided.',
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
      const req = addRequirement(contract_file ?? DEFAULT_CONTRACT, {
        id, title, description, status, acceptanceCriteria: acceptance_criteria,
      });
      return `Added requirement ${req.id} (${req.title})`;
    });
  },
);

server.tool(
  'update_requirement',
  'Update fields of an existing requirement. Include a changelog note explaining what changed and why.',
  {
    id: z.string().describe('Requirement ID to update. ID itself never changes.'),
    title: z.string().optional().describe('New title'),
    description: z.string().optional().describe('New description'),
    version: z.string().optional().describe('New semver version (major=breaking, minor=additive, patch=wording)'),
    acceptance_criteria: z.array(z.string()).optional().describe('Replacement criteria'),
    note: z.string().optional().describe('Changelog entry explaining the change'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ id, title, description, version, acceptance_criteria, note, contract_file }) => {
    return safeCall(() => {
      updateRequirement(contract_file ?? DEFAULT_CONTRACT, {
        id, title, description, version, acceptanceCriteria: acceptance_criteria, note,
      });
      return `Updated requirement ${id}`;
    });
  },
);

server.tool(
  'add_corner_case',
  'Add a corner case to a requirement. Each gets its own ID and is independently tracked in coverage.',
  {
    req_id: z.string().describe('Parent requirement ID (e.g. AUTH-001)'),
    description: z.string().describe('Edge condition, error path, or boundary behavior'),
    id: z.string().optional().describe('Explicit corner case ID. Auto-generated if omitted.'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ req_id, description, id, contract_file }) => {
    return safeCall(() => {
      const cc = addCornerCase(contract_file ?? DEFAULT_CONTRACT, { reqId: req_id, description, id });
      return `Added corner case ${cc.id} to ${req_id}`;
    });
  },
);

server.tool(
  'update_corner_case',
  'Update the description of an existing corner case. IDs are permanent — if semantics change fundamentally, add a new corner case instead.',
  {
    req_id: z.string().describe('Parent requirement ID'),
    cc_id: z.string().describe('Corner case ID to update'),
    description: z.string().optional().describe('New description'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ req_id, cc_id, description, contract_file }) => {
    return safeCall(() => {
      updateCornerCase(contract_file ?? DEFAULT_CONTRACT, { reqId: req_id, ccId: cc_id, description });
      return `Updated corner case ${cc_id}`;
    });
  },
);

server.tool(
  'deprecate_requirement',
  'Deprecate an APPROVED requirement that is no longer relevant. Excluded from coverage metrics but kept for traceability.',
  {
    id: z.string().describe('Requirement ID to deprecate. Only approved requirements can be deprecated.'),
    reason: z.string().optional().describe('Why this requirement is no longer relevant. Recorded in changelog.'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ id, reason, contract_file }) => {
    return safeCall(() => {
      deprecateRequirement(contract_file ?? DEFAULT_CONTRACT, id, reason);
      return `Deprecated requirement ${id}`;
    });
  },
);

server.tool(
  'supersede_requirement',
  'Replace an existing requirement with a new one. Old requirement becomes SUPERSEDED with a reference to the replacement.',
  {
    old_id: z.string().describe('Requirement ID to supersede'),
    title: z.string().describe('Title for the replacement requirement'),
    new_id: z.string().optional().describe('Explicit ID for replacement. Auto-generated if omitted.'),
    description: z.string().optional().describe('Description for replacement'),
    acceptance_criteria: z.array(z.string()).optional().describe('Criteria for replacement'),
    contract_file: z.string().optional().describe('Path to CONTRACT.yaml'),
  },
  async ({ old_id, title, new_id, description, acceptance_criteria, contract_file }) => {
    return safeCall(() => {
      const req = supersedeRequirement(contract_file ?? DEFAULT_CONTRACT, old_id, {
        newId: new_id, title, description, acceptanceCriteria: acceptance_criteria,
      });
      return `Superseded ${old_id} with ${req.id} (${req.title})`;
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

function findRequirement(contract: ModuleContract, id: string): Requirement {
  // Check if it's a corner case ID — find the parent requirement
  const ccMatch = id.match(/^(.+)-CC-\d+$/);
  if (ccMatch) {
    const parentId = ccMatch[1];
    const req = contract.requirements.find(r => r.id === parentId);
    if (req) return req;
  }

  const req = contract.requirements.find(r => r.id === id);
  if (!req) throw new Error(`Requirement '${id}' not found`);
  return req;
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
