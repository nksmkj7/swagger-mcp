import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type PromptCharacteristics, type PromptArgsSchema } from "../types/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any;

export const addPromptRegistry = <ArgsSchema extends PromptArgsSchema>(
    server: McpServer,
    prompt: PromptCharacteristics<ArgsSchema>
): void => {
    server.registerPrompt(
        prompt.name,
        {
            description: prompt.description,
            argsSchema: prompt.argsSchema as AnyArgs,
        },
        async (args: AnyArgs) => prompt.execute(args)
    );
};
