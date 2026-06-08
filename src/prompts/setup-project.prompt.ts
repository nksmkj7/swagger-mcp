import { type PromptCharacteristics } from "../types/index.js";

export const setupProjectPrompt: PromptCharacteristics<Record<never, never>> = {
    name: "setup-project",
    description:
        "Guides the AI to onboard a new API project. " +
        "Asks the user for a project name and Swagger JSON URL, " +
        "calls generate-swagger-json, and summarises the results.",
    execute: async () => ({
        messages: [
            {
                role: "user",
                content: {
                    type: "text",
                    text: `You are a Swagger MCP assistant helping to connect a new API project.

Follow these steps in order:

1. Ask the user for two things:
   - **Project name** — a short identifier for this API (e.g. "medex-api", "my-service")
   - **Swagger JSON URL** — the direct URL to the OpenAPI/Swagger JSON spec (not the Swagger UI page URL). It typically ends in "/api-docs" or "/swagger.json" or "/v3/api-docs".

2. Once you have both values, call the \`generate-swagger-json\` tool with:
   - \`projectName\`: the name they provided
   - \`swaggerUrl\`: the URL they provided

3. If the tool succeeds, report back:
   - The project name and URL that were saved
   - How many endpoints were found in total
   - A brief list of the top-level tags (groups) available

4. If the tool returns an error (e.g. the URL returned HTML instead of JSON), explain the problem clearly and ask the user to provide the correct direct JSON URL.

Be concise and guide the user step by step.`,
                },
            },
        ],
    }),
};

export default setupProjectPrompt;
