import { z } from "zod";
import { type PromptCharacteristics } from "../types/index.js";

const argsSchema = {
    path: z.string().describe("API path, e.g. /auth/register or /users/{id}"),
    method: z.string().describe("HTTP method: GET, POST, PUT, PATCH, DELETE"),
    parts: z.string().optional().describe("Comma-separated parts to generate: requestBody, pathParams, queryParams, responseBody. Defaults to all."),
    style: z.string().optional().describe("Declaration style: 'interface' or 'type'. Defaults to 'interface'."),
};

export const generateTypesPrompt: PromptCharacteristics<typeof argsSchema> = {
    name: "generate-types",
    description:
        "Generates TypeScript types/interfaces for a specific API endpoint. " +
        "The user can choose which parts to generate (requestBody, pathParams, queryParams, responseBody) " +
        "and the declaration style (interface or type).",
    argsSchema,
    execute: async ({ path, method, parts, style }) => {
        const parsedParts = parts
            ? parts.split(",").map((p) => p.trim()).filter(Boolean)
            : ["requestBody", "pathParams", "queryParams", "responseBody"];

        const parsedStyle = style === "type" ? "type" : "interface";

        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `You are a Swagger MCP assistant. Generate TypeScript types for the following endpoint:

**${method.toUpperCase()} ${path}**

Call \`generate-typescript-types\` with:
- \`path\`: "${path}"
- \`method\`: "${method.toUpperCase()}"
- \`generate\`: ${JSON.stringify(parsedParts)}
- \`outputStyle\`: "${parsedStyle}"

Then present the output as follows:
1. Show a summary of what was generated (which parts, which names)
2. Show the complete TypeScript code in a single \`typescript\` code block, ready to copy-paste
3. If any requested parts had no data (e.g. no request body), mention it clearly
4. If any warnings were returned by the tool, display them

The output should be self-contained — no imports needed.`,
                    },
                },
            ],
        };
    },
};

export default generateTypesPrompt;
