# CLI

The `pratya` CLI provides commands for validating contracts, running tests with requirement tracing, and auditing coverage.

## Installation

```bash
npm install -D @intrigsoft/pratya
```

## Commands

### `pratya validate`

Parse and validate a `CONTRACT.yaml` file against the schema.

```bash
pratya validate --contract ./CONTRACT.yaml
```

| Option | Default | Description |
|---|---|---|
| `--contract <path>` | `./CONTRACT.yaml` | Path to the contract file |

### `pratya run`

Run contract tests and generate a coverage report.

```bash
pratya run --runner vitest --coverage
```

| Option | Default | Description |
|---|---|---|
| `--contract <path>` | `./CONTRACT.yaml` | Path to the contract file |
| `--runner <type>` | `vitest` | Test runner: `vitest`, `playwright`, or `jest` |
| `--output-dir <path>` | `./pratya-report` | Output directory for reports |
| `--requirement <id>` | — | Run tests for a specific requirement only |
| `--coverage` | `false` | Enable code coverage collection |
| `--coverage-summary <path>` | — | Path to Istanbul `coverage-summary.json` |
| `--fail-on-violations` | `false` | Exit 1 if any ERROR-level violations |
| `--min-coverage <n>` | `0` | Minimum requirement coverage threshold (0–100) |

### `pratya audit`

Run audit rules and report violations without executing tests.

```bash
pratya audit --contract ./CONTRACT.yaml
```

| Option | Default | Description |
|---|---|---|
| `--contract <path>` | `./CONTRACT.yaml` | Path to the contract file |
| `--report <path>` | — | Path to `pratya-report.json` for staleness checks |

### `pratya comment`

Generate a Markdown summary suitable for a PR comment.

```bash
pratya comment --report ./pratya-report/pratya-report.json
```

| Option | Default | Description |
|---|---|---|
| `--report <path>` | — | Path to `pratya-report.json` (required) |

## CI Integration

```yaml
# GitHub Actions example
- run: npx pratya run --runner vitest --coverage --fail-on-violations --min-coverage 80
```
