import { z } from "zod";
import { type PromptCharacteristics } from "../types/index.js";

const argsSchema = {
    path: z.string().describe("API path, e.g. /auth/register or /users/{id}"),
    method: z.string().describe("HTTP method: GET, POST, PUT, PATCH, DELETE"),
};

export const implementEndpointPrompt: PromptCharacteristics<typeof argsSchema> = {
    name: "implement-endpoint",
    description:
        "One-shot prompt that chains endpoint-detail, generate-curl, and generate-typescript-types " +
        "to give the developer everything needed to implement a call to a specific endpoint.",
    argsSchema,
    execute: async ({ path, method }) => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `You are a Swagger MCP assistant. The user wants everything they need to implement a call to:

**${method.toUpperCase()} ${path}**

Run the following three tools in order and combine their output into a single, well-structured response:

---

**Step 1 — Endpoint detail**
Call \`endpoint-detail\` with:
- \`path\`: "${path}"
- \`method\`: "${method.toUpperCase()}"

Present the results including:
- Summary / description
- Path parameters (if any)
- Query parameters (if any)
- Required headers (if any)
- Request body schema (if any)
- Response schemas for each status code

---

**Step 2 — cURL command**
Call \`generate-curl\` with:
- \`path\`: "${path}"
- \`method\`: "${method.toUpperCase()}"

Show the generated cURL command in a code block.

---

**Step 3 — TypeScript types**
Call \`generate-typescript-types\` with:
- \`path\`: "${path}"
- \`method\`: "${method.toUpperCase()}"
- \`generate\`: ["requestBody", "pathParams", "queryParams", "responseBody"]
- \`outputStyle\`: "interface"

Show all generated TypeScript interfaces in a code block.

---

After all three steps, provide a brief implementation note summarising what the developer needs to know (auth requirements, important parameters, expected response shape).`,
                },
            },
        ],
    }),
};

export default implementEndpointPrompt;
