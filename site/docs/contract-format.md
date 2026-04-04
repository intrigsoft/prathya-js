# CONTRACT.yaml Reference

## Overview

`CONTRACT.yaml` is the central artifact in Prathya. It defines the behavioral contract for a module — what the software is supposed to do, expressed as versioned requirements with corner cases.

The file lives at the module root and is version-controlled alongside the code.

## Full Example

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
    status: approved
    title: User login with email and password
    description: >
      The system must authenticate a user given a valid email and password
      combination, issuing a signed JWT access token and a refresh token
      upon success.
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
      The system must issue a new access token when presented with a valid,
      non-expired refresh token.
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
      - version: 1.0.0
        date: 2026-02-01
        note: Superseded by AUTH-005 (MFA-aware reset)

  - id: AUTH-005
    version: 1.0.0
    status: approved
    supersedes: AUTH-003
    title: MFA-aware password reset
    description: >
      The system must allow password reset via email link, with optional MFA
      verification step before the reset is permitted.
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

## Schema Reference

### `module` (required)

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Short uppercase identifier (e.g., `AUTH`) |
| `name` | string | Yes | Human-readable module name |
| `description` | string | No | Module description |
| `owner` | string | No | Contact for the module owner |
| `created` | date | No | Creation date |
| `version` | string | No | Module contract version (semver) |

### `requirements[]` (required)

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique requirement ID (format: `{MODULE}-{NNN}`) |
| `version` | string | Yes | Requirement version (semver) |
| `status` | string | Yes | One of: `draft`, `approved`, `deprecated`, `superseded` |
| `title` | string | Yes | Short requirement title |
| `description` | string | Yes | Full requirement description |
| `acceptance_criteria` | string[] | No | List of acceptance criteria |
| `corner_cases` | object[] | No | List of corner cases |
| `changelog` | object[] | No | Version history |
| `supersedes` | string | No | ID of the requirement this one replaces |
| `superseded_by` | string | No | ID of the requirement that replaces this one |

### `corner_cases[]`

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Corner case ID (format: `{MODULE}-{NNN}-CC-{NNN}`) |
| `description` | string | Yes | What the corner case tests |

### `changelog[]`

| Field | Type | Required | Description |
|---|---|---|---|
| `version` | string | Yes | Version at which this change occurred |
| `date` | date | Yes | Date of the change |
| `note` | string | Yes | Description of the change |

## ID Format Rules

| Pattern | Example | Meaning |
|---|---|---|
| `{MODULE}-{NNN}` | `AUTH-001` | Requirement |
| `{MODULE}-{NNN}-CC-{NNN}` | `AUTH-001-CC-001` | Corner case |

- IDs are **append-only** — never reused
- Requirements are **never deleted** — use `deprecated` or `superseded`
- Corner case IDs are scoped to their parent requirement

## Annotation Usage

=== "Vitest"

    ```typescript
    import { test, expect } from '@intrigsoft/pratya-vitest';

    // Single requirement
    test('login returns tokens', ({ requirement }) => {
      requirement('AUTH-001');
      // ...
    });

    // Multiple requirements or corner cases
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

    // Single requirement
    test('login returns tokens', () => {
      requirement('AUTH-001');
      // ...
    });

    // Multiple requirements
    test('login with invalid credentials', () => {
      requirement(['AUTH-001-CC-001', 'AUTH-001-CC-002']);
      // ...
    });
    ```

`requirement()` accepts a single ID or an array of IDs. Call it inside the test body.
