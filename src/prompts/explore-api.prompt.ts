import { z } from "zod";
import { type PromptCharacteristics } from "../types/index.js";

const argsSchema = {
    tag: z.string().optional().describe("Optional tag name to filter endpoints (e.g. 'Auth', 'Users'). Omit to show all."),
};

export const exploreApiPrompt: PromptCharacteristics<typeof argsSchema> = {
    name: "explore-api",
    description:
        "Lists all available API endpoints grouped by tag. " +
        "Optionally filters to a specific tag (e.g. 'Auth', 'Users').",
    argsSchema,
    execute: async ({ tag }) => {
        const tagContext = tag
            ? `The user wants to explore endpoints under the **"${tag}"** tag only.`
            : "The user wants to see all available endpoints.";

        return {
            messages: [
                {
                    role: "user",
                    content: {
                        type: "text",
                        text: `You are a Swagger MCP assistant helping the user explore API endpoints.

${tagContext}

Steps:
1. Call the \`available-api-endpoints\` tool to retrieve all endpoints.
2. Present the results in a clean, readable format:
   - Group endpoints by their tag
   - For each endpoint show: HTTP method, path, and summary/description
   ${tag ? `- Only show endpoints that belong to the "${tag}" tag` : "- Show all tags and their endpoints"}
3. At the end, mention the total number of endpoints found${tag ? ` in the "${tag}" tag` : ""}.
4. Suggest the user can use \`implement-endpoint\` or \`endpoint-detail\` tool to dive deeper into any specific endpoint.

Keep the output concise and easy to scan.`,
                    },
                },
            ],
        };
    },
};

export default exploreApiPrompt;
