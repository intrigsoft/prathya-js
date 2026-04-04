# MCP Server

The Prathya MCP server exposes the contract management surface via the [Model Context Protocol](https://modelcontextprotocol.io/), enabling AI coding agents to participate directly in the contract-driven development loop.

An agent can read the contract before generating code, check coverage after generating tests, and iterate until the contract is satisfied.

## Installation

```bash
npm install -D @intrigsoft/pratya-mcp-server
```

## Configuration

Add the Prathya MCP server to your AI coding tool's MCP configuration. The server uses **stdio** transport.

```json
{
  "mcpServers": {
    "prathya": {
      "command": "npx",
      "args": ["@intrigsoft/pratya-mcp-server"]
    }
  }
}
```

### Configuration Options

The server reads `CONTRACT.yaml` from the current working directory by default.

## Tool Reference

The server exposes tools organized into read and write operations.

### Read Tools

| Tool | Description |
|---|---|
| `get_contract` | Returns the full parsed contract as JSON |
| `list_requirements` | Lists all requirements with ID, title, status, and version |
| `get_requirement` | Returns full details for a specific requirement by ID |
| `list_untested` | Lists approved requirements and corner cases with no mapped tests |
| `get_coverage_matrix` | Returns the full coverage matrix: requirements, mapped tests, and coverage percentages |
| `run_audit` | Runs the audit engine and returns all violations |
| `validate_contract` | Validates the CONTRACT.yaml against the schema |
| `get_setup_guide` | Returns a setup guide for the specified test runner |

### Write Tools

| Tool | Description |
|---|---|
| `add_requirement` | Adds a new requirement to the contract |
| `update_requirement` | Updates an existing requirement's fields |
| `add_corner_case` | Adds a corner case to an existing requirement |
| `update_corner_case` | Updates an existing corner case |
| `deprecate_requirement` | Sets a requirement's status to `deprecated` |
| `supersede_requirement` | Marks a requirement as superseded and links to its replacement |

## Agent Workflow

A typical workflow for an AI agent using the MCP server:

1. **Read the contract** — `get_contract` or `list_requirements` to understand what the module must do
2. **Check coverage** — `list_untested` to find gaps
3. **Generate tests** — write tests annotated with `requirement()` for uncovered items
4. **Verify** — `get_coverage_matrix` to confirm coverage improved
5. **Iterate** — repeat until the contract is fully satisfied

## Technical Details

- **Transport:** stdio (standard input/output)
- **SDK:** `@modelcontextprotocol/sdk`
- **Runtime:** Node.js >= 18
