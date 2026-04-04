# Audit Rules

The `pratya audit` command (and the audit phase within `pratya run`) checks your contract and test mappings for issues.

## Rules

| Rule | Severity | Trigger | Example |
|---|---|---|---|
| Unknown requirement ID | ERROR | `requirement()` references an ID not found in CONTRACT.yaml | `requirement('FOO-999')` but `FOO-999` not in contract |
| Uncovered approved requirement | ERROR | An `approved` requirement has zero tests | `AUTH-001` is approved but no test calls `requirement('AUTH-001')` |
| Uncovered corner case | WARN | An `approved` requirement has corner cases without tests | `AUTH-001-CC-003` has no mapped test |
| Deprecated requirement referenced | WARN | A test still references a `deprecated` requirement | `requirement('AUTH-003')` where `AUTH-003` is deprecated |
| Superseded requirement referenced | WARN | A test still references a `superseded` requirement | `requirement('AUTH-003')` where `AUTH-003` is superseded by `AUTH-005` |
| Broken supersession chain | ERROR | `superseded_by` points to an ID that doesn't exist | `AUTH-003` superseded by `AUTH-099` but `AUTH-099` not in contract |
| Stale requirement version | WARN | Requirement version changed since the last report | Version bumped but tests haven't been re-evaluated |

## Severity Levels

| Severity | Impact |
|---|---|
| **ERROR** | Fails the run when `failOnViolations` is enabled |
| **WARN** | Printed to console but does not fail |

## Configuration

### Enable build failure on violations

```bash
pratya run --runner vitest --fail-on-violations
```

Or via reporter options:

```typescript
['@intrigsoft/pratya-vitest/reporter', {
  contractPath: './CONTRACT.yaml',
  failOnViolations: true,
}]
```

### Set minimum coverage threshold

```bash
pratya run --runner vitest --min-coverage 80
```

### Exclude statuses from coverage

Via reporter options:

```typescript
['@intrigsoft/pratya-vitest/reporter', {
  contractPath: './CONTRACT.yaml',
  excludeStatuses: ['draft', 'deprecated'],
}]
```

## JSON Report

Violations are included in the JSON report at `pratya-report/pratya-report.json`:

```json
{
  "violations": [
    {
      "type": "UNCOVERED_CORNER_CASE",
      "requirementId": "AUTH-001",
      "cornerCaseId": "AUTH-001-CC-003",
      "message": "Corner case AUTH-001-CC-003 has no mapped test"
    }
  ]
}
```
