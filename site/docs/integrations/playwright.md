# Playwright Integration

## Installation

```bash
npm install -D @intrigsoft/pratya-playwright @intrigsoft/pratya-core @intrigsoft/pratya
```

## Configuration

Add the Prathya reporter to your `playwright.config.ts`:

```typescript
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

### Reporter Options

| Option | Default | Description |
|---|---|---|
| `contractPath` | `./CONTRACT.yaml` | Path to the contract file |
| `outputDir` | `./pratya-report` | Output directory for reports |
| `failOnViolations` | `false` | Exit with error if any ERROR-level violations are found |
| `minimumRequirementCoverage` | `0` | Minimum coverage percentage threshold (0–100) |
| `excludeStatuses` | `[]` | Requirement statuses to exclude from coverage |

## Annotating Tests

Import `test` and `expect` from `@intrigsoft/pratya-playwright` instead of `@playwright/test`:

```typescript
import { test, expect } from '@intrigsoft/pratya-playwright';

test('user can log in', async ({ page, requirement }) => {
  requirement('AUTH-001');

  await page.goto('/login');
  await page.fill('[name=email]', 'user@example.com');
  await page.fill('[name=password]', 'password');
  await page.click('button[type=submit]');

  await expect(page).toHaveURL('/dashboard');
});

test('wrong password shows error', async ({ page, requirement }) => {
  requirement('AUTH-001-CC-001');

  await page.goto('/login');
  await page.fill('[name=email]', 'user@example.com');
  await page.fill('[name=password]', 'wrong');
  await page.click('button[type=submit]');

  await expect(page.locator('.error')).toBeVisible();
});
```

### Multiple Requirements

```typescript
test('invalid credentials handled uniformly', async ({ page, requirement }) => {
  requirement(['AUTH-001-CC-001', 'AUTH-001-CC-002']);
  // ...
});
```

## Running

```bash
# Run with the Prathya CLI
pratya run --runner playwright

# Or run Playwright directly (reporter still collects traces)
npx playwright test
```
