# Swagger MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server that brings OpenAPI/Swagger documentation directly into your AI assistant. Point it at any Swagger/OpenAPI JSON URL and instantly get endpoint discovery, deep inspection, cURL generation, and TypeScript type generation — all inside Cursor or Claude.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Setup in Cursor](#setup-in-cursor)
- [Setup in Claude Desktop](#setup-in-claude-desktop)
- [MCP Inspector (Debug)](#mcp-inspector-debug)
- [Available Tools](#available-tools)
- [Available Prompts](#available-prompts)
- [Typical Workflow](#typical-workflow)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Overview

The Swagger MCP Server acts as a bridge between your AI assistant and any REST API documented with OpenAPI 3.x or Swagger 2.x. Once registered as an MCP server in Cursor or Claude Desktop, it exposes a set of **tools** and **prompts** that let your AI:

- Fetch and cache an OpenAPI spec from a URL
- Browse all available API endpoints grouped by tag
- Inspect full endpoint contracts (parameters, request body, responses) with `$ref` resolution
- Generate ready-to-run `curl` commands with schema-derived sample bodies
- Generate copy-paste TypeScript interfaces and types from response/request schemas

The server runs over **stdio transport** (standard input/output), which is the native transport for MCP in Cursor and Claude Desktop.

---

## Features

| Feature | Description |
|---------|-------------|
| **Spec fetching & caching** | Downloads OpenAPI JSON and caches it locally under `doc/` |
| **Endpoint discovery** | Lists all endpoints grouped by OpenAPI tags |
| **Deep inspection** | Full parameter, request body, and response details with recursive `$ref` resolution |
| **cURL generation** | Executable `curl` commands with placeholder values derived from the schema |
| **TypeScript types** | Generates `interface` or `type` aliases for request/response shapes |
| **Guided prompts** | Step-by-step AI workflow prompts for setup, exploration, implementation, and testing |
| **Persistent state** | Remembers your last project across server restarts |

---

## How It Works

```
AI Client (Cursor / Claude Desktop)
         │
         │  stdio  (MCP protocol)
         ▼
  swagger-mcp-server  (src/server.ts)
         │
         ├── Tools ──► utility + helpers
         │                  │
         │                  ▼
         │            doc/*.json          ← cached OpenAPI spec
         │            doc/.project-config.json  ← active project state
         │
         └── Prompts ──► guided AI instructions
```

### First-use flow
1. Call `generate-swagger-json` with a `projectName` and `swaggerUrl`
2. Server fetches the JSON spec, validates it, and saves it under `doc/`
3. A grouped summary (`-grouped.json`) is also saved for fast browsing
4. Active project state is persisted so the server restores it on restart

### Subsequent calls
- All other tools read from the cached spec — no network calls needed
- State is restored automatically from `doc/.project-config.json` on server start

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- An OpenAPI/Swagger spec accessible at a **direct JSON URL** (not the Swagger UI HTML page)

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-org/swagger-mcp.git
cd swagger-mcp

# 2. Install dependencies
npm install

# 3. (Optional) copy the env sample
cp .env.sample .env
```

No build step is required for local use — the server runs directly via `tsx`.

To verify the server starts correctly:

```bash
npm start
```

You should see the server start with no errors. Press `Ctrl+C` to stop it.

---

## Setup in Cursor

Cursor supports MCP servers through its **MCP configuration file**. You can configure the Swagger MCP server at either the global level (available in all projects) or the project level.

### Global configuration (recommended)

Open or create the Cursor MCP config file at:

```
~/.cursor/mcp.json
```

Add the following entry under `mcpServers`:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/swagger/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/to/swagger/src/server.ts"
      ],
      "cwd": "/absolute/path/to/swagger"
    }
  }
}
```

Replace `/absolute/path/to/swagger` with the actual path to this repository. For example:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "node",
      "args": [
        "/Users/yourname/projects/swagger/node_modules/tsx/dist/cli.mjs",
        "/Users/yourname/projects/swagger/src/server.ts"
      ],
      "cwd": "/Users/yourname/projects/swagger"
    }
  }
}
```

### Project-level configuration

Create a `.cursor/mcp.json` file in the root of your project with the same structure as above.

### Enabling the server in Cursor

1. Open **Cursor Settings** (`Cmd+,`)
2. Navigate to **Features → MCP**
3. You should see `swagger-mcp` listed — toggle it on
4. Restart Cursor or reload the window (`Cmd+Shift+P` → `Developer: Reload Window`)

### Verifying it works

Open a Cursor chat and type:

```
Use the setup-project prompt to get started
```

Or invoke a tool directly:

```
Call the available-api-endpoints tool
```

If the server is running correctly, the AI will respond with results from your cached API spec.

---

## Setup in Claude Desktop

Claude Desktop uses the same MCP configuration format.

### Locate the config file

| Platform | Path |
|----------|------|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

### Add the server

Open (or create) the config file and add:

```json
{
  "mcpServers": {
    "swagger-mcp": {
      "command": "node",
      "args": [
        "/absolute/path/to/swagger/node_modules/tsx/dist/cli.mjs",
        "/absolute/path/to/swagger/src/server.ts"
      ],
      "cwd": "/absolute/path/to/swagger"
    }
  }
}
```

### Restart Claude Desktop

Fully quit and reopen Claude Desktop. The MCP server will start alongside it.

### Verifying it works

In a Claude conversation, you can ask:

```
List all available API endpoints
```

Or use a prompt:

```
Use the explore-api prompt
```

Claude will use the `swagger-mcp` tools to answer from your cached spec.

---

## MCP Inspector (Debug)

The MCP Inspector is a browser-based tool for testing MCP servers interactively. It lets you call tools and prompts manually, inspect inputs/outputs, and debug issues.

```bash
npm run inspector
```

This launches the Inspector against the running server. Open the URL shown in the terminal (usually `http://localhost:5173`) and you can:

- Browse all registered tools and prompts
- Fill in arguments and execute tool calls
- See raw JSON responses

---

## Available Tools

Tools are callable functions exposed to the AI. All tools read from the locally cached OpenAPI spec (except `generate-swagger-json` which fetches from the network).

### `generate-swagger-json`

**Must be called first.** Fetches the OpenAPI spec from a URL and caches it locally.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `projectName` | string | Yes | A short name for this API project (e.g. `medex`, `stripe`) |
| `swaggerUrl` | string | Yes | Direct URL to the OpenAPI JSON spec (not the Swagger UI page) |

**Returns:** Saved file paths, API title, version, and total endpoint count.

**Example:**
```
Generate swagger JSON for projectName "myapi" and swaggerUrl "https://api.example.com/api-docs-json"
```

---

### `available-api-endpoints`

Lists all API endpoints grouped by OpenAPI tag.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| *(none)* | — | — | — |

**Returns:** Endpoints grouped by tag with method and path, plus total count.

---

### `endpoint-detail`

Returns the full contract for a specific endpoint: path/query/header parameters, request body schema (with `$ref` resolved), and all response schemas.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | API path, e.g. `/users/{id}` |
| `method` | string | No | HTTP method (`GET`, `POST`, etc.). If omitted, returns all methods for the path. |

---

### `generate-curl`

Generates a ready-to-run `curl` command for an endpoint. The sample request body is auto-generated from the schema (with placeholder values like `"example@email.com"`, `"uuid-here"`, etc.).

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | API path |
| `method` | string | Yes | HTTP method |
| `baseUrl` | string | No | Override the base URL (defaults to the spec's server URL) |
| `pathParams` | object | No | Values for path parameters |
| `queryParams` | object | No | Values for query parameters |
| `headers` | object | No | Additional headers |
| `body` | object | No | Override the auto-generated request body |

---

### `generate-typescript-types`

Generates TypeScript `interface` or `type` definitions from an endpoint's schemas.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | API path |
| `method` | string | Yes | HTTP method |
| `generate` | array | Yes | Which parts to generate: `"requestBody"`, `"queryParams"`, `"pathParams"`, `"response"` |
| `outputStyle` | string | Yes | `"interface"` or `"type"` |
| `responseCodes` | array | No | Specific response codes to include (e.g. `["200", "404"]`). Defaults to all. |

---

## Available Prompts

Prompts are pre-built guided workflows that chain multiple tools together and provide context-aware instructions to the AI.

### `setup-project`

Onboards a new API project. Guides you through calling `generate-swagger-json` and confirms the spec was loaded successfully.

**Arguments:** None

---

### `explore-api`

Browse and summarize available API endpoints. Optionally filter by a specific tag.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `tag` | string | No | Filter endpoints to a specific OpenAPI tag |

---

### `implement-endpoint`

Full implementation workflow for a single endpoint. Chains `endpoint-detail` → `generate-curl` → `generate-typescript-types` and presents everything needed to implement an API call.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | API path |
| `method` | string | Yes | HTTP method |

---

### `generate-types`

Generates TypeScript types with configurable options.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | API path |
| `method` | string | Yes | HTTP method |
| `parts` | array | No | Which parts to include (defaults to all) |
| `style` | string | No | `"interface"` or `"type"` (defaults to `"interface"`) |

---

### `test-endpoint`

Generates a `curl` command and a Jest/Vitest test scaffold for an endpoint.

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | Yes | API path |
| `method` | string | Yes | HTTP method |

---

## Typical Workflow

### 1. Initialize a project

```
Use the setup-project prompt
```

The AI will ask for your project name and Swagger JSON URL, then load and cache the spec.

### 2. Explore the API

```
Use the explore-api prompt
```

Or filter by tag:

```
Use the explore-api prompt with tag "users"
```

### 3. Deep-dive into an endpoint

```
Use the implement-endpoint prompt with path "/auth/login" and method "POST"
```

This returns the full parameter/body/response contract, a sample curl command, and TypeScript types.

### 4. Generate types only

```
Use the generate-types prompt with path "/users/{id}" method "GET" style "interface"
```

### 5. Scaffold a test

```
Use the test-endpoint prompt with path "/auth/register" method "POST"
```

---

## Project Structure

```
swagger/
├── src/
│   ├── server.ts                        # MCP server entry point (stdio transport)
│   ├── state/
│   │   └── project.state.ts             # In-memory + persisted project config
│   ├── types/
│   │   ├── index.ts                     # Tool / Prompt characteristic types
│   │   ├── endpoint.types.ts            # HTTP / endpoint domain types
│   │   └── openapi.types.ts             # OpenAPI spec types + type guard
│   ├── tools/
│   │   ├── generate-swagger-json.tool.ts
│   │   ├── available-endpoints.tool.ts
│   │   ├── endpoint-detail.tool.ts
│   │   ├── generate-curl.tool.ts
│   │   └── generate-typescript-types.tool.ts
│   ├── prompts/
│   │   ├── setup-project.prompt.ts
│   │   ├── explore-api.prompt.ts
│   │   ├── implement-endpoint.prompt.ts
│   │   ├── generate-types.prompt.ts
│   │   └── test-endpoint.prompt.ts
│   ├── helpers/
│   │   ├── endpoint-detail.helper.ts    # $ref resolution + endpoint parsing
│   │   ├── curl-builder.helper.ts       # curl command generation
│   │   └── typescript-type-builder.helper.ts  # JSON Schema → TypeScript
│   └── utility/
│       ├── add-tool-registry.utility.ts
│       ├── add-prompt-registry.utility.ts
│       └── swagger.utility.ts           # Fetch, save, load, parse OpenAPI specs
├── doc/
│   ├── .project-config.json             # Persisted active project state
│   └── *.json                           # Cached OpenAPI specs + grouped summaries
├── .env.sample                          # Environment variable template
├── package.json
└── tsconfig.json
```

---

## Environment Variables

Copy `.env.sample` to `.env`. The variables are optional placeholders for future use — none are required for the server to run.

| Variable | Description |
|----------|-------------|
| `CURSOR_API_KEY` | Reserved for future Cursor integration |
| `DEVELOPMENT_BASE_URL` | Your API's development base URL |
| `STAGING_BASE_URL` | Your API's staging base URL |
| `PRODUCTION_BASE_URL` | Your API's production base URL |
| `SWAGGER_TITLE` | Default API title label |
| `SWAGGER_VERSION` | Default API version label |
| `SWAGGER_DESCRIPTION` | Default API description |

---

## Troubleshooting

### The server doesn't appear in Cursor / Claude

- Verify the **absolute paths** in your MCP config are correct
- Confirm `node_modules` is installed (`npm install`)
- Check that Node.js is accessible at the `command` path — run `which node` to confirm
- Reload Cursor (`Cmd+Shift+P` → `Developer: Reload Window`) or restart Claude Desktop

### `generate-swagger-json` returns an error about HTML

The `swaggerUrl` must point to the **raw JSON spec**, not the Swagger UI page. In Swagger UI, look for a link like `/api-docs-json`, `/openapi.json`, or `/swagger.json` — use that URL, not the browser page URL.

### Tools return "No project configured"

Run `generate-swagger-json` first to initialize the project. The server needs an active project before any other tool can run.

### State is lost after restart

The server auto-restores state from `doc/.project-config.json` on startup. If this file is missing or corrupted, re-run `generate-swagger-json`.

### MCP Inspector won't connect

Make sure you are not already running `npm start` in another terminal — only one process can hold stdio. Stop any running instance before launching the Inspector.

### TypeScript types are missing fields

Deeply nested `$ref` schemas are resolved up to **10 levels deep** to prevent circular reference loops. If a schema is cut off, it means the nesting exceeds this limit.
