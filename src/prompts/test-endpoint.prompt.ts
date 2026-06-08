import { z } from "zod";
import { type PromptCharacteristics } from "../types/index.js";

const argsSchema = {
    path: z.string().describe("API path, e.g. /auth/login or /users/{id}"),
    method: z.string().describe("HTTP method: GET, POST, PUT, PATCH, DELETE"),
};

export const testEndpointPrompt: PromptCharacteristics<typeof argsSchema> = {
    name: "test-endpoint",
    description:
        "Generates a cURL command and a Jest/Vitest test scaffold for a specific API endpoint. " +
        "Uses endpoint-detail and generate-curl to build realistic, schema-accurate test cases.",
    argsSchema,
    execute: async ({ path, method }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `You are a Swagger MCP assistant. Generate a test scaffold for:

**${method.toUpperCase()} ${path}**

---

**Step 1 — Fetch endpoint details**
Call \`endpoint-detail\` with:
- \`path\`: "${path}"
- \`method\`: "${method.toUpperCase()}"

Use the result to understand the full contract: parameters, request body, and all documented response codes.

---

**Step 2 — Generate cURL**
Call \`generate-curl\` with:
- \`path\`: "${path}"
- \`method\`: "${method.toUpperCase()}"

Show the cURL command in a code block for quick manual testing.

---

**Step 3 — Write a Jest/Vitest test scaffold**
Using the schema information from Step 1, write a \`describe\` block that covers:
- A happy-path test for the primary success response (e.g. 200 or 201)
- An error-path test for at least one documented error response (e.g. 400, 401, 404)
- Typed request/response variables using the actual field names from the schema

The test scaffold should use \`fetch\` or \`axios\` (whichever looks more appropriate) and include:
- Placeholder \`BASE_URL\` constant
- Realistic sample values matching the schema types
- \`expect\` assertions on the response status and key response fields
- A comment where the user should add their auth token if the endpoint requires authentication

Output the test code in a \`typescript\` code block.`,
                },
            },
        ],
    }),
};

export default testEndpointPrompt;
