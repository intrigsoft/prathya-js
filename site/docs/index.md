# Prathya JS

**Contract-Driven Requirement Coverage for JavaScript & TypeScript**

Prathya is an open-source tool that brings formal requirement traceability to software testing. It treats requirements as first-class, versioned artifacts, links tests to those requirements via annotations, and measures **requirement coverage** — a more meaningful quality signal than code coverage alone.

## The Core Insight

Code coverage tells you what was _touched_. Requirement coverage tells you whether _intent_ was verified.

Prathya introduces **Contract-Driven Development (CDD)** as a natural companion to established methodologies:

| Methodology | Focus | Gap |
|---|---|---|
| **TDD** | Write the test first, then the code | Drives implementation but says nothing about whether the tests are the *right* tests |
| **BDD** | Write behavior specifications in natural language | Improves communication but doesn't enforce traceability or coverage measurement |
| **CDD** | Define the contract first. Tests are written against the contract | The contract is the source of truth — not the code, not the tests, not a ticket |

## Quick Start

### 1. Install

=== "Vitest"

    ```bash
    npm install -D @intrigsoft/pratya-vitest @intrigsoft/pratya-core @intrigsoft/pratya
    ```

=== "Playwright"

    ```bash
    npm install -D @intrigsoft/pratya-playwright @intrigsoft/pratya-core @intrigsoft/pratya
    ```

=== "Jest"

    ```bash
    npm install -D @intrigsoft/pratya-jest @intrigsoft/pratya-core @intrigsoft/pratya
    ```

### 2. Create `CONTRACT.yaml`

```yaml
module:
  id: AUTH
  name: Auth Service
  description: Handles user authentication

requirements:
  - id: AUTH-001
    version: 1.0.0
    status: approved
    title: User login with valid credentials
    description: >
      The system must authenticate a user given valid credentials,
      returning a signed JWT.
    acceptance_criteria:
      - Returns HTTP 200 with a JWT in the response body
    corner_cases:
      - id: AUTH-001-CC-001
        description: Invalid password — must return 401
    changelog:
      - version: 1.0.0
        date: "2026-01-01"
        note: Initial definition
```

### 3. Annotate your tests

=== "Vitest"

    ```typescript
    import { test, expect } from '@intrigsoft/pratya-vitest';

    test('login with valid credentials returns JWT', ({ requirement }) => {
      requirement('AUTH-001');
      // test body
    });

    test('login with wrong password returns 401', ({ requirement }) => {
      requirement('AUTH-001-CC-001');
      // test body
    });
    ```

=== "Playwright"

    ```typescript
    import { test, expect } from '@intrigsoft/pratya-playwright';

    test('login with valid credentials', async ({ page, requirement }) => {
      requirement('AUTH-001');
      // test body
    });
    ```

=== "Jest"

    ```javascript
    const { requirement } = require('@intrigsoft/pratya-jest');

    test('login with valid credentials returns JWT', () => {
      requirement('AUTH-001');
      // test body
    });
    ```

### 4. Configure the reporter

=== "Vitest"

    ```typescript
    // vitest.config.ts
    import { defineConfig } from 'vitest/config';

    export default defineConfig({
      test: {
        reporters: [
          'default',
          ['@intrigsoft/pratya-vitest/reporter', {
            contractPath: './CONTRACT.yaml',
            outputDir: './pratya-report',
          }],
        ],
      },
    });
    ```

=== "Playwright"

    ```typescript
    // playwright.config.ts
    import { defineConfig } from '@playwright/test';

    export default defineConfig({
      reporter: [
        ['list'],
        ['@intrigsoft/pratya-playwright/reporter', {
          contractPath: './CONTRACT.yaml',
          outputDir: './pratya-report',
        }],
      ],
    });
    ```

=== "Jest"

    ```javascript
    // jest.config.js
    module.exports = {
      reporters: ['default', ['@intrigsoft/pratya-jest/reporter', {
        contractPath: './CONTRACT.yaml',
      }]],
      setupFilesAfterFramework: ['@intrigsoft/pratya-jest/setup'],
    };
    ```

### 5. Run

```bash
pratya run --runner vitest --coverage
```

Prathya produces an HTML report at `pratya-report/index.html` and a JSON report at `pratya-report/pratya-report.json`.

## What's Next

- [Concepts](concepts.md) — understand Contract-Driven Development in depth
- [CONTRACT.yaml Reference](contract-format.md) — full schema and field reference
- [Integrations](integrations/vitest.md) — Vitest, Playwright, and Jest setup
- [CLI](cli.md) — command reference
- [MCP Server](mcp-server.md) — AI agent integration via Model Context Protocol
- [Audit Rules](audit-rules.md) — what Prathya checks and how to configure it
