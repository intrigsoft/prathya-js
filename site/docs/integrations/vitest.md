# Vitest Integration

## Installation

```bash
npm install -D @intrigsoft/pratya-vitest @intrigsoft/pratya-core @intrigsoft/pratya
```

## Configuration

Add the Prathya reporter to your `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['json-summary'],
      reportsDirectory: './coverage',
    },
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

### Reporter Options

| Option | Default | Description |
|---|---|---|
| `contractPath` | `./CONTRACT.yaml` | Path to the contract file |
| `outputDir` | `./pratya-report` | Output directory for reports |
| `failOnViolations` | `false` | Exit with error if any ERROR-level violations are found |
| `minimumRequirementCoverage` | `0` | Minimum coverage percentage threshold (0–100) |
| `excludeStatuses` | `[]` | Requirement statuses to exclude from coverage |
| `codeCoverage.summaryPath` | — | Path to Istanbul `coverage-summary.json` for contract code coverage |

## Annotating Tests

Import `test` and `expect` from `@intrigsoft/pratya-vitest` instead of `vitest`:

```typescript
import { test, expect } from '@intrigsoft/pratya-vitest';

test('user login returns JWT', ({ requirement }) => {
  requirement('AUTH-001');
  expect(login('user@example.com', 'password')).toHaveProperty('token');
});

test('wrong password returns 401', ({ requirement }) => {
  requirement('AUTH-001-CC-001');
  expect(() => login('user@example.com', 'wrong')).toThrow();
});
```

### Multiple Requirements

```typescript
test('invalid credentials are handled uniformly', ({ requirement }) => {
  requirement(['AUTH-001-CC-001', 'AUTH-001-CC-002']);
  // ...
});
```

### Using with `describe`

Import `describe` from `vitest` as usual — only `test` and `expect` come from Prathya:

```typescript
import { describe } from 'vitest';
import { test, expect } from '@intrigsoft/pratya-vitest';

describe('AuthService', () => {
  test('login works', ({ requirement }) => {
    requirement('AUTH-001');
    // ...
  });
});
```

## Running

```bash
# Run with the Prathya CLI
pratya run --runner vitest --coverage

# Or run vitest directly (reporter still collects traces)
npx vitest run
```
