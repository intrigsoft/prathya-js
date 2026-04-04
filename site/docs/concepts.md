# Concepts

## Contract-Driven Development

Contract-Driven Development (CDD) starts from a simple premise: **define what the software must do before writing tests or code**. The contract is a versioned, machine-readable artifact that lives in source control alongside the code it describes.

Tests are written against the contract. Coverage is measured against the contract. The contract is the source of truth.

!!! note "Disambiguation"
    The term *Contract-Driven Development* is traditionally associated with defining API or service interaction contracts prior to implementation. In Prathya, the contract refers to **behavioral requirements** — not API schemas — and coverage is measured against those requirements.

## Key Components

### The Contract (`CONTRACT.yaml`)

Every module has a `CONTRACT.yaml` file that defines its behavioral contract. This is a human-authored, version-controlled artifact that defines what the module is supposed to do — including corner cases as first-class citizens, not afterthoughts.

### The Annotation (`requirement()`)

Test methods call `requirement('REQ-ID')` to declare which requirement or corner case they verify. This is the only coupling between test code and requirements.

=== "Vitest"

    ```typescript
    import { test, expect } from '@intrigsoft/pratya-vitest';

    test('login with valid credentials', ({ requirement }) => {
      requirement('AUTH-001');
      // ...
    });

    test('login with invalid credentials', ({ requirement }) => {
      requirement(['AUTH-001-CC-001', 'AUTH-001-CC-002']);
      // ...
    });
    ```

=== "Playwright"

    ```typescript
    import { test, expect } from '@intrigsoft/pratya-playwright';

    test('login flow', async ({ page, requirement }) => {
      requirement('AUTH-001');
      // ...
    });
    ```

=== "Jest"

    ```javascript
    const { requirement } = require('@intrigsoft/pratya-jest');

    test('login with valid credentials', () => {
      requirement('AUTH-001');
      // ...
    });

    test('login with invalid credentials', () => {
      requirement(['AUTH-001-CC-001', 'AUTH-001-CC-002']);
      // ...
    });
    ```

One test can cover multiple requirements or corner cases. One requirement can be covered by multiple tests. The relationship is many-to-many.

### Requirement Coverage

Prathya scans annotations at test time, cross-references them against `CONTRACT.yaml`, and computes a coverage matrix. No manually maintained mapping file is needed — the annotations _are_ the trace.

## Three-State Coverage Model

Coverage goes beyond a simple covered/uncovered binary:

| State | Meaning |
|---|---|
| **Covered + Passing** | Contract satisfied — the requirement is tested and the test passes |
| **Covered + Failing** | Contract broken — a test exists but the implementation is wrong |
| **Not Covered** | Contract unverified — no test maps to this requirement |

## Requirement Lifecycle

Requirements follow a defined lifecycle:

| Status | Meaning |
|---|---|
| `draft` | Not yet approved — excluded from coverage calculations |
| `approved` | Active requirement — must have tests |
| `deprecated` | No longer relevant — excluded from coverage |
| `superseded` | Replaced by a newer requirement (linked via `superseded_by`) |

Requirements are **never deleted** — only deprecated or superseded. IDs are append-only and never reused.

## Corner Cases as First-Class Citizens

Corner cases are defined directly inside each requirement, with their own IDs:

```yaml
corner_cases:
  - id: AUTH-001-CC-001
    description: Invalid password — must return 401, not 404
  - id: AUTH-001-CC-002
    description: Email does not exist — response must be identical to wrong password
```

Corner cases can be annotated and tracked independently, ensuring edge cases are tested deliberately rather than discovered accidentally.

## ID Conventions

Requirement IDs are opaque strings — Prathya does not enforce a specific format. The following convention is recommended:

### Recommended Format

```
{MODULE}-{SEQUENCE}         → AUTH-001        (requirement)
{MODULE}-{SEQUENCE}-CC-{N}  → AUTH-001-CC-002 (corner case)
```

### Rules

- IDs are **append-only and never reused**
- When a requirement changes significantly, it gets a **new ID** with a `supersedes` back-reference
- When a requirement changes in wording only, the **version increments** on the same ID
- When a requirement is split, the original is deprecated and new IDs are created

### Recommended Versioning Semantics

Requirement versions are free-form strings. We recommend following semver semantics:

| Bump | Meaning |
|---|---|
| **Major** | Breaking change to the contract — mapped tests must be re-evaluated |
| **Minor** | Additive change (new corner case, expanded scope) |
| **Patch** | Wording or clarification, no behavioral change |

## Contract Code Coverage

When Istanbul/v8 coverage is enabled, Prathya computes **contract code coverage** — the percentage of code covered exclusively by requirement-annotated tests. This is distinct from total code coverage, which includes all tests regardless of whether they trace to a requirement.

The gap between the two numbers is meaningful. If total code coverage is 87% but contract code coverage is 60%, then 27% of your code coverage comes from tests that aren't linked to any requirement. Those tests exercise code, but don't prove intent.

## The Two-Signal Model

Requirement coverage is the primary signal. Code coverage only adds meaning once requirement coverage is healthy.

Prathya measures requirement coverage — whether each documented requirement has a test mapped to it. It does not verify correctness; it trusts that a test annotated with `requirement('AUTH-001')` actually verifies that requirement. This is an indirect measurement.

!!! failure "Signal 1 — Requirement Coverage Low"
    Your module is not verified against its own contract. Either the requirements haven't been tested, or the tests that exist don't declare what they're proving. Code coverage being high or low alongside this is irrelevant — unverified requirements are unverified regardless.

!!! warning "Signal 2 — Requirement Coverage High, Code Coverage Low"
    Your contract tests exist and are mapped correctly, but they're not exercising the code. Three implications:

    - :material-close: **Tests are too shallow** — mocking core dependencies instead of running real code paths.
    - :material-close: **Dead code exists** — logic that no requirement accounts for and no test reaches.
    - :material-close: **Over-abstraction** — the contract doesn't reflect the full scope of what the module actually does.

!!! success "The Healthy State — Requirement Coverage High, Code Coverage High"
    Intent is verified and the code backing it is exercised. Istanbul and Prathya agree: nothing is hiding.

## Why This Matters for AI-Assisted Development

LLMs are fast at generating code but rarely clean up after themselves. Features get rewritten, approaches change mid-conversation, and unused code accumulates — silently polluting the codebase and reducing maintainability.

Prathya surfaces this problem. When requirement coverage is high but code coverage drops, it signals that code exists which no requirement accounts for and no test reaches. In an AI-assisted workflow, that's almost always dead code left behind by the LLM.

The [MCP server](mcp-server.md) closes the loop: the agent reads the contract before generating code, checks coverage after generating tests, and you can use the coverage gap to direct the agent to clean up what it left behind.
