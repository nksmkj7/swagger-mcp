import {
    RegisteredTool,
    type McpServer,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ToolCharacteristics } from "../types/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySchema = any;

export const addToolRegistry = <ArgType, ReturnType>(
    server: McpServer,
    tool: ToolCharacteristics<ArgType, ReturnType>
): RegisteredTool => {
    return server.registerTool(
        tool.name,
        {
            title: tool.title || tool.name,
            description: tool.description || tool.name,
            inputSchema: tool.inputSchema as AnySchema,
            outputSchema: tool.outputSchema as AnySchema,
        },
        async (args: Record<string, unknown>) => {
            const result = await tool.execute(args as ArgType);
            return {
                content: [
                    { type: "text" as const, text: JSON.stringify(result) },
                ],
                structuredContent: result as Record<string, unknown>,
            };
        }
    );
};
