# Jest Integration

## Installation

```bash
npm install -D @intrigsoft/pratya-jest @intrigsoft/pratya-core @intrigsoft/pratya
```

## Configuration

Add the Prathya reporter and setup module to your `jest.config.js`:

```javascript
module.exports = {
  reporters: ['default', ['@intrigsoft/pratya-jest/reporter', {
    contractPath: './CONTRACT.yaml',
    outputDir: './pratya-report',
  }]],
  setupFilesAfterFramework: ['@intrigsoft/pratya-jest/setup'],
};
```

!!! important
    The `@intrigsoft/pratya-jest/setup` entry is required. It installs an `afterEach` hook that flushes requirement annotations to disk so the reporter can read them.

### Reporter Options

| Option | Default | Description |
|---|---|---|
| `contractPath` | `./CONTRACT.yaml` | Path to the contract file |
| `outputDir` | `./pratya-report` | Output directory for reports |
| `failOnViolations` | `false` | Exit with error if any ERROR-level violations are found |
| `minimumRequirementCoverage` | `0` | Minimum coverage percentage threshold (0–100) |
| `excludeStatuses` | `[]` | Requirement statuses to exclude from coverage |

## Annotating Tests

Import `requirement` from `@intrigsoft/pratya-jest` and call it inside your test body:

```javascript
const { requirement } = require('@intrigsoft/pratya-jest');

test('user login returns JWT', () => {
  requirement('AUTH-001');
  const result = login('user@example.com', 'password');
  expect(result).toHaveProperty('token');
});

test('wrong password returns 401', () => {
  requirement('AUTH-001-CC-001');
  expect(() => login('user@example.com', 'wrong')).toThrow();
});
```

### ES Modules

```typescript
import { requirement } from '@intrigsoft/pratya-jest';

test('user login returns JWT', () => {
  requirement('AUTH-001');
  // ...
});
```

### Multiple Requirements

```javascript
test('invalid credentials handled uniformly', () => {
  requirement(['AUTH-001-CC-001', 'AUTH-001-CC-002']);
  // ...
});
```

## How It Works

Unlike Vitest and Playwright, Jest has no built-in annotation mechanism. Prathya uses:

1. **`requirement()` function** — stores annotations in a global map keyed by test name
2. **`@intrigsoft/pratya-jest/setup`** — an `afterEach` hook that flushes annotations to a JSON file on disk
3. **`@intrigsoft/pratya-jest/reporter`** — reads the annotation files in `onRunComplete` and builds trace entries

This design works correctly with Jest's worker-based parallelism — each worker writes to a unique file.

## Running

```bash
# Run with the Prathya CLI
pratya run --runner jest

# Or run Jest directly (reporter still collects traces)
npx jest
```
