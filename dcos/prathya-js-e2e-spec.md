# Pratya — JavaScript/TypeScript E2E Implementation Spec

## What Pratya Is

Pratya is a requirement coverage and traceability framework built on a methodology called **Contract-Driven Development (CDD)**. The central idea: code coverage tells you what was *touched*. Requirement coverage tells you whether *intent* was verified.

Pratya treats requirements as first-class, versioned artifacts in a `CONTRACT.yaml` file. Tests are linked to requirements via a thin annotation layer. Pratya then measures requirement coverage and — combined with code coverage — exposes a quadrant of quality signals:

| | Code Coverage High | Code Coverage Low |
|---|---|---|
| **Requirement Coverage High** | Healthy | Dead code or over-abstraction |
| **Requirement Coverage Low** | Undocumented/missing features | Chaos — prototype territory |

The Java implementation measures code coverage via JaCoCo. The JS implementation targets **Playwright E2E tests**, where coverage comes from an instrumented running server — not from the test process itself.

---

## Why E2E-First for JavaScript

`@Requirement` annotations are only meaningful on tests that verify the full observable behavior described in the acceptance criteria. A unit test that mocks the database and the token service can "cover" `AUTH-001` without verifying that the real authentication stack works. The coverage number looks green while the contract is never actually exercised.

Playwright E2E tests fix this structurally. They exercise the full stack — real HTTP, real database, real business logic. When they pass, the requirement is genuinely satisfied.

This also resolves the code coverage integration problem: when the server runs with V8/Istanbul instrumentation during the Playwright run, the coverage data represents what was actually touched by real contract-exercising requests. Per-requirement code coverage becomes achievable by correlating which tests ran (from the Playwright reporter) with which lines were hit (from the instrumented server).

---

## CONTRACT.yaml Format

This format is shared with the Java implementation and must remain identical. It is the canonical contract artifact.

```yaml
module:
  id: AUTH
  name: Authentication Module
  description: Handles user authentication, token issuance, and session management
  owner: team@example.com
  created: 2026-03-06
  version: 1.2.0

requirements:

  - id: AUTH-001
    version: 1.1.0
    status: approved           # draft | approved | deprecated | superseded
    title: User login with email and password
    description: >
      The system must authenticate a user given a valid email and password combination,
      issuing a signed JWT access token and a refresh token upon success.
    acceptance_criteria:
      - Valid credentials return a signed JWT access token and refresh token
      - Access token expiry is set to 15 minutes
      - Refresh token expiry is set to 7 days
    corner_cases:
      - id: AUTH-001-CC-001
        description: Email is valid but password is incorrect — must return 401, not 404
      - id: AUTH-001-CC-002
        description: Email does not exist — response must be identical to wrong password to prevent enumeration
      - id: AUTH-001-CC-003
        description: Email is provided in mixed case — must be normalized before lookup
    changelog:
      - version: 1.0.0
        date: 2026-01-10
        note: Initial definition
      - version: 1.1.0
        date: 2026-02-18
        note: Added enumeration prevention requirement to CC-002

  - id: AUTH-002
    version: 1.0.0
    status: approved
    title: JWT refresh
    description: >
      The system must issue a new access token when presented with a valid, non-expired refresh token.
    acceptance_criteria:
      - Valid refresh token returns a new access token
      - Original refresh token is rotated (invalidated and replaced)
      - Expired refresh token returns 401
    corner_cases:
      - id: AUTH-002-CC-001
        description: Refresh token is used twice — second use must fail (rotation enforcement)
      - id: AUTH-002-CC-002
        description: Refresh token from a revoked session must be rejected even if not expired
    changelog:
      - version: 1.0.0
        date: 2026-01-10
        note: Initial definition

  - id: AUTH-003
    version: 1.0.0
    status: superseded
    superseded_by: AUTH-005
    title: Single-factor password reset (superseded)
    description: >
      The system must allow password reset via email link only.
    acceptance_criteria:
      - Reset link is valid for 30 minutes
    corner_cases: []
    changelog:
      - version: 1.0.0
        date: 2026-01-10
        note: Initial definition

  - id: AUTH-005
    version: 1.0.0
    status: approved
    supersedes: AUTH-003
    title: MFA-aware password reset
    description: >
      The system must allow password reset via email link, with optional MFA verification
      step before the reset is permitted.
    acceptance_criteria:
      - Reset link is valid for 15 minutes
      - If MFA is enabled on the account, OTP verification is required before reset
      - Reset invalidates all existing sessions
    corner_cases:
      - id: AUTH-005-CC-001
        description: Reset link is used after expiry — must return 410 Gone, not 401
      - id: AUTH-005-CC-002
        description: User attempts reset while already logged in — session must still be invalidated
    changelog:
      - version: 1.0.0
        date: 2026-02-01
        note: Supersedes AUTH-003. Adds MFA step and session invalidation.
```

### Requirement ID Format

```
{MODULE}-{SEQUENCE}         → AUTH-001        (requirement)
{MODULE}-{SEQUENCE}-CC-{N}  → AUTH-001-CC-002  (corner case)
```

IDs are permanent, immutable, and append-only. Requirements are never deleted — only `deprecated` or `superseded`.

---

## Annotation API

The JS equivalent of Java's `@Requirement` annotation is implemented via **Playwright's `test.extend()` fixture API**. This is the idiomatic Playwright mechanism for enriching tests with custom behaviour — it preserves full access to `test.describe`, `test.slow()`, `test.fixme()`, `test.skip()`, and all other Playwright test modifiers that a wrapper function would block.

```typescript
// @pratya/playwright — primary API
import { test as base } from '@playwright/test';

export const test = base.extend<{ requirement: (ids: string | string[]) => void }>({
  requirement: [async ({ }, use, testInfo) => {
    await use((ids: string | string[]) => {
      const normalized = Array.isArray(ids) ? ids : [ids];
      normalized.forEach(id => {
        testInfo.annotations.push({ type: 'requirement', description: id });
        testInfo.tags.push(`@requirement:${id}`);
      });
    });
  }, { auto: false }],
});
```

Usage in test files:

```typescript
import { test, expect } from '@pratya/playwright';

// Declare requirement IDs at the top of the test body
test('valid credentials return signed tokens', async ({ page, requirement }) => {
  requirement('AUTH-001');
  // full Playwright test body — all modifiers work as normal
});

// Multiple IDs — one test covering requirement + corner cases
test('unknown email returns identical response to wrong password', async ({ page, requirement }) => {
  requirement(['AUTH-001-CC-001', 'AUTH-001-CC-002']);
  // ...
});

// test.describe, test.slow(), test.fixme() all work unchanged
test.describe('token refresh', () => {
  test.slow();

  test('refresh token used twice — second call fails', async ({ page, requirement }) => {
    requirement('AUTH-002-CC-001');
    // ...
  });
});
```

Plain `test()` calls without `requirement()` are ignored by Pratya entirely. They run as normal in the Playwright suite but do not contribute to requirement coverage. This is intentional — not every test is a contract test.

Requirement IDs are stored as Playwright test annotations (`testInfo.annotations`) and tags (`testInfo.tags`). Annotations are used by the reporter to build the trace. Tags are used by `pratya run` for targeted execution via `--grep`.

---

## Package Structure

```
packages/
├── core/           # published as @pratya/core
├── playwright/     # published as @pratya/playwright
└── cli/            # published as pratya (CLI binary)
```

Monorepo managed with pnpm workspaces.

---

## Package Details

### `@pratya/core`

The framework-agnostic engine. No dependency on Playwright or any test runner.

**Responsibilities:**
- Parse and validate `CONTRACT.yaml` (using `js-yaml` + `ajv` JSON Schema)
- Domain model: `Requirement`, `CornerCase`, `RequirementStatus`, `TraceEntry`, `CoverageMatrix`
- Coverage computation: cross-reference trace entries against active requirements, produce per-requirement and aggregate percentages
- Code coverage integration: read Istanbul-compatible `coverage-summary.json`
- Report generation: HTML (via `mustache`) and JSON
- Audit rules engine

**Domain types:**

```typescript
type RequirementStatus = 'draft' | 'approved' | 'deprecated' | 'superseded';

interface Requirement {
  id: string;
  version: string;
  status: RequirementStatus;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  cornerCases: CornerCase[];
  supersedes?: string;
  supersededBy?: string;
  changelog: ChangelogEntry[];
}

interface TraceEntry {
  requirementIds: string[];
  testTitle: string;
  testFile: string;
  requirementVersionAtTest?: Record<string, string>; // id → version recorded at run time
  result?: 'passed' | 'failed' | 'skipped';
}

interface CoverageMatrix {
  module: string;
  generatedAt: string;
  requirementCoverage: number;
  cornerCaseCoverage: number;
  codeCoverage?: number;             // from instrumented server, if available
  requirements: RequirementCoverage[];
  violations: Violation[];
}

interface RequirementCoverage {
  id: string;
  version: string;
  status: RequirementStatus;
  covered: boolean;
  passing: boolean | null;           // null = no test; true = all passing; false = any failing
  tests: Array<{ title: string; requirementVersionAtTest: string }>;
  cornerCases: CornerCaseCoverage[];
  codeCoveragePercent?: number;
}
```

---

### `@pratya/playwright`

The Playwright integration. Two exports: the extended `test` object and a Playwright Reporter class.

#### Reporter (`src/reporter.ts`)

Implements Playwright's `Reporter` interface from `@playwright/test/reporter`.

```typescript
export interface PratyaReporterOptions {
  contractPath?: string;                     // default: './CONTRACT.yaml'
  outputDir?: string;                        // default: './pratya-report'
  failOnViolations?: boolean;                // default: false
  minimumRequirementCoverage?: number;       // 0–100, default: 0
  excludeStatuses?: RequirementStatus[];     // default: ['deprecated', 'superseded']
  codeCoverage?: {
    summaryPath: string;                     // path to Istanbul coverage-summary.json
  };
}
```

`onTestEnd`: read `test.annotations` where `type === 'requirement'`, extract IDs and the current version of each from the parsed contract, build a `TraceEntry`.

`onEnd`:
1. Parse `CONTRACT.yaml`
2. Run audit to collect violations (including version staleness check)
3. Compute coverage matrix (incorporating code coverage summary if configured)
4. Add a `COVERAGE_BELOW_THRESHOLD` ERROR violation if threshold is configured and not met
5. Write HTML and JSON reports to `outputDir`
6. If `failOnViolations` is true and any ERROR violation exists, set `process.exitCode = 1`

#### Configuration (`playwright.config.ts`)

The reporter is registered using Playwright's `[path, options]` tuple form. `@pratya/playwright` exports the reporter class as the default export of the `@pratya/playwright/reporter` subpath:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['@pratya/playwright/reporter', {
      contractPath: './CONTRACT.yaml',
      outputDir: './pratya-report',
      failOnViolations: true,
      minimumRequirementCoverage: 80,
      excludeStatuses: ['deprecated', 'superseded'],
      codeCoverage: {
        summaryPath: './coverage/coverage-summary.json',
      },
    }],
  ],
});
```

---

### `pratya` CLI

```bash
# Validate CONTRACT.yaml structure and ID integrity
pratya validate

# Audit: print violations to console, exit 1 if any ERRORs
pratya audit [--report ./pratya-report/pratya-report.json]

# Generate report from an existing pratya-report.json
pratya report --input ./pratya-report/pratya-report.json --output ./pratya-report

# Run all contract tests (approved requirements only)
pratya run

# Run tests for a specific requirement
pratya run --requirement AUTH-001

# Output a Markdown PR comment summary
pratya comment --report ./pratya-report/pratya-report.json
```

#### `pratya run` — Tag-Based Filtering

`pratya run` invokes Playwright via `execa` using Playwright's native `--grep` tag filtering. It does **not** dry-parse test files to extract titles — that approach is brittle against dynamic test titles, template literals, and generated tests.

The `test` fixture attaches a Playwright tag to every test that calls `requirement()`:

```
@requirement:AUTH-001
```

`pratya run --requirement AUTH-001` translates directly to:

```bash
npx playwright test --grep "@requirement:AUTH-001"
```

`pratya run` with no filter reads the approved requirement IDs from `CONTRACT.yaml` and constructs a regex:

```bash
npx playwright test --grep "@requirement:(AUTH-001|AUTH-002|AUTH-005)"
```

Only tests linked to active (approved) requirements are executed. Tests without `requirement()` calls are never included.

---

## Audit Rules

| Rule | Severity | Type |
|---|---|---|
| Requirement ID in `requirement()` not found in CONTRACT.yaml | ERROR | `ORPHAN_ANNOTATION` |
| Approved requirement with no mapped test | ERROR | `UNCOVERED_REQUIREMENT` |
| Approved corner case with no mapped test | WARN | `UNCOVERED_CORNER_CASE` |
| Deprecated requirement still referenced | WARN | `DEPRECATED_REFERENCE` |
| Superseded requirement still referenced | WARN | `SUPERSEDED_REFERENCE` |
| `superseded_by` or `supersedes` points to non-existent ID | ERROR | `BROKEN_SUPERSESSION` |
| Requirement coverage below configured threshold | ERROR | `COVERAGE_BELOW_THRESHOLD` |
| Test references requirement at an older version than CONTRACT.yaml | WARN | `STALE_REQUIREMENT_VERSION` |

### Version Staleness

When a test runs, the reporter records the current version of each referenced requirement from `CONTRACT.yaml` into the `TraceEntry` as `requirementVersionAtTest`. On a subsequent run, if the requirement's version in `CONTRACT.yaml` has advanced, a `STALE_REQUIREMENT_VERSION` warning is emitted — the test has not been verified against the updated contract.

This is most critical for major version bumps, which signal a breaking change to the contract that requires test re-evaluation. The warning does not fail the build by default but can be escalated to ERROR via configuration.

---

## Coverage Report

### HTML Report

JaCoCo-inspired layout, rendered via Mustache templates.

- **Module summary** — total requirements, covered, uncovered, coverage %, code coverage % (if available), quadrant badge
- **Requirement matrix** — per-requirement rows with status badge, version, test count, corner case coverage, pass/fail state
- **Three-state coverage** — covered+passing (green), covered+failing (red), not covered (grey)
- **Drill-down** — click a requirement to see mapped test titles, version at test time vs current version, which corner cases are covered vs missing
- **Supersession chain** — deprecated/superseded requirements shown with links to successors
- **Violations section** — ERRORs and WARNs grouped by severity

### JSON Report (`pratya-report.json`)

```json
{
  "module": "AUTH",
  "generatedAt": "2026-03-31T10:00:00Z",
  "summary": {
    "totalRequirements": 5,
    "activeRequirements": 3,
    "coveredRequirements": 3,
    "requirementCoverage": 100.0,
    "totalCornerCases": 7,
    "coveredCornerCases": 6,
    "cornerCaseCoverage": 85.7,
    "codeCoverage": 73.2
  },
  "requirements": [
    {
      "id": "AUTH-001",
      "version": "1.1.0",
      "status": "approved",
      "covered": true,
      "passing": true,
      "tests": [
        { "title": "valid credentials return signed tokens", "requirementVersionAtTest": "1.1.0" }
      ],
      "codeCoveragePercent": 78.4,
      "cornerCases": [
        { "id": "AUTH-001-CC-001", "covered": true, "passing": true },
        { "id": "AUTH-001-CC-002", "covered": true, "passing": true },
        { "id": "AUTH-001-CC-003", "covered": false, "passing": null }
      ]
    }
  ],
  "violations": [
    {
      "severity": "WARN",
      "type": "UNCOVERED_CORNER_CASE",
      "requirementId": "AUTH-001",
      "cornerCaseId": "AUTH-001-CC-003",
      "message": "Corner case AUTH-001-CC-003 has no mapped test"
    }
  ]
}
```

---

## CI Integration

### GitHub Actions

```yaml
- name: Run Playwright tests
  run: npx playwright test

- name: Pratya coverage check
  if: always()
  run: pratya audit --report ./pratya-report/pratya-report.json

- name: Upload Pratya report
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: pratya-report
    path: pratya-report/
```

`pratya audit` detects `CI=true` and emits GitHub Actions annotation syntax:

```
::error file=src/auth/auth.test.ts::AUTH-001-CC-003 has no mapped test (UNCOVERED_CORNER_CASE)
::warning file=CONTRACT.yaml::AUTH-003 is superseded but still referenced in 2 tests (SUPERSEDED_REFERENCE)
```

Violations surface as inline PR annotations without requiring a separate GitHub Action.

### PR Comment Summary

`pratya comment` generates a Markdown summary for posting as a PR comment:

```bash
pratya comment --report ./pratya-report/pratya-report.json
```

Output:

```markdown
## Pratya Requirement Coverage

| Metric | Value |
|---|---|
| Requirement Coverage | 100% (3/3) |
| Corner Case Coverage | 85.7% (6/7) |
| Code Coverage | 73.2% |

**1 warning** — AUTH-001-CC-003 has no mapped test
```

---

## Code Coverage Setup (instrumented server)

### Aggregate coverage (v0.2)

For teams using a Node.js backend:

1. Start the server with `NODE_V8_COVERAGE=./coverage/raw node server.js` or via `c8` as a process wrapper
2. After the Playwright run, `c8 report --reporter=json-summary` generates `coverage-summary.json`
3. Point `codeCoverage.summaryPath` in the reporter config to that file

This requires no changes to the server under test — only to the process that starts it.

### Per-requirement coverage (v0.5)

The server exposes an optional flush endpoint:

```
POST /__pratya/coverage/flush?test=<encoded-test-title>
```

The Pratya fixture calls this at the end of each test via a lightweight `fetch`. `@pratya/core` attributes each snapshot's coverage to the requirement IDs of the test that triggered the flush. The flush endpoint is entirely optional — aggregate coverage works without it.

---

## Technology Stack

| Component | Technology |
|---|---|
| Language | TypeScript (ESM + CJS dual output via `tsup`) |
| Monorepo | pnpm workspaces |
| YAML parsing | `js-yaml` |
| Schema validation | `ajv` |
| HTML report | `mustache` |
| CLI | `commander` + `execa` |
| Test runner peer | `@playwright/test` ≥ 1.40 |
| Distribution | npm (`@pratya/` scope) |
| License | Apache 2.0 |

---

## Roadmap

1. **v0.1** — `@pratya/core` — parser, domain model, coverage engine, audit rules (including version staleness)
2. **v0.2** — `@pratya/playwright` — `test` fixture + reporter, HTML + JSON report; aggregate code coverage from `coverage-summary.json`
3. **v0.3** — `pratya` CLI — `validate`, `audit`, `run` (tag-based), `comment`; GitHub Actions annotation output
4. **v0.4** — CI integration hardening — status checks, configurable thresholds per requirement
5. **v0.5** — Per-requirement code coverage via server flush endpoint
6. **v1.0** — npm publication, stable schema, production-ready