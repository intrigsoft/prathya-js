# Prathya JS

**Contract-Driven Requirement Coverage for JavaScript & TypeScript**

Prathya brings formal requirement traceability to your test suite. Define requirements in a `CONTRACT.yaml`, link tests to those requirements via annotations, and measure **requirement coverage** — whether your tests verify what the software is supposed to do.

## Quick Start

### 1. Install

```bash
# Vitest
npm install -D @intrigsoft/pratya-vitest @intrigsoft/pratya-core @intrigsoft/pratya

# Playwright
npm install -D @intrigsoft/pratya-playwright @intrigsoft/pratya-core @intrigsoft/pratya

# Jest
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
    description: The system must authenticate a user given valid credentials.
    acceptance_criteria:
      - Returns HTTP 200 with a JWT
    corner_cases:
      - id: AUTH-001-CC-001
        description: Invalid password returns 401
    changelog:
      - version: 1.0.0
        date: "2026-01-01"
        note: Initial definition
```

### 3. Annotate tests

```typescript
// Vitest
import { test, expect } from '@intrigsoft/pratya-vitest';

test('login returns JWT', ({ requirement }) => {
  requirement('AUTH-001');
  // ...
});
```

```typescript
// Playwright
import { test, expect } from '@intrigsoft/pratya-playwright';

test('login flow', async ({ page, requirement }) => {
  requirement('AUTH-001');
  // ...
});
```

```javascript
// Jest
const { requirement } = require('@intrigsoft/pratya-jest');

test('login returns JWT', () => {
  requirement('AUTH-001');
  // ...
});
```

### 4. Run

```bash
pratya run --runner vitest --coverage
```

## Packages

| Package | Description |
|---|---|
| [`@intrigsoft/pratya-core`](packages/core) | Parser, coverage engine, audit rules, report generation |
| [`@intrigsoft/pratya`](packages/cli) | CLI for validation, audit, and test execution |
| [`@intrigsoft/pratya-vitest`](packages/vitest) | Vitest integration — fixture and reporter |
| [`@intrigsoft/pratya-playwright`](packages/playwright) | Playwright integration — fixture and reporter |
| [`@intrigsoft/pratya-jest`](packages/jest) | Jest integration — annotation helper, setup, and reporter |
| [`@intrigsoft/pratya-mcp-server`](packages/mcp-server) | MCP server for AI agent integration |

## Documentation

Full documentation is available at [intrigsoft.github.io/prathya-js](https://intrigsoft.github.io/prathya-js).

## License

Apache 2.0
