import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";
import "dotenv/config";
import availableApiEndpointsTool from "./tools/available-endpoints.tool";
import endpointDetailTool from "./tools/endpoint-detail.tool";
import generateCurlTool from "./tools/generate-curl.tool";
import generateSwaggerJsonTool from "./tools/generate-swagger-json.tool";
import generateTypescriptTypesTool from "./tools/generate-typescript-types.tool";
import { addToolRegistry } from "./utility/add-tool-registry.utility";
import { addPromptRegistry } from "./utility/add-prompt-registry.utility";
import { getProjectState, loadProjectStateFromFile } from "./state/project.state";
import setupProjectPrompt from "./prompts/setup-project.prompt";
import exploreApiPrompt from "./prompts/explore-api.prompt";
import implementEndpointPrompt from "./prompts/implement-endpoint.prompt";
import generateTypesPrompt from "./prompts/generate-types.prompt";
import testEndpointPrompt from "./prompts/test-endpoint.prompt";

async function cleanup(exitCode = 0): Promise<void> {
    console.error("\n[Cleanup] Starting graceful shutdown...");
    console.error("[Cleanup] Graceful shutdown complete");
    process.exit(exitCode);
}

process.on("unhandledRejection", async (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
    await cleanup(1);
});

process.on("uncaughtException", async (error) => {
    console.error("Uncaught Exception:", error);
    await cleanup(1);
});

process.on("SIGINT", async () => {
    console.error("\n[Signal] Received SIGINT (Ctrl+C)");
    await cleanup(0);
});

process.on("SIGTERM", async () => {
    console.error("\n[Signal] Received SIGTERM");
    await cleanup(0);
});

async function main() {
    const server = new McpServer(
        {
            name: "swagger-mcp-server",
            version: "1.0.0",
        },
        {
            capabilities: {
                resources: {
                    subscribe: true,
                    listChanged: true,
                },
                tools: {
                    listChanged: true,
                },
                prompts: {
                    listChanged: true,
                },
            },
        },
    );

    addToolRegistry(server, generateSwaggerJsonTool);
    addToolRegistry(server, availableApiEndpointsTool);
    addToolRegistry(server, endpointDetailTool);
    addToolRegistry(server, generateCurlTool);
    addToolRegistry(server, generateTypescriptTypesTool);

    addPromptRegistry(server, setupProjectPrompt);
    addPromptRegistry(server, exploreApiPrompt);
    addPromptRegistry(server, implementEndpointPrompt);
    addPromptRegistry(server, generateTypesPrompt);
    addPromptRegistry(server, testEndpointPrompt);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    const loaded = await loadProjectStateFromFile();
    if (loaded) {
        console.error(`[Server] Restored project "${loaded.projectName}" from config | JSON URL: ${loaded.jsonUrl}`);
    } else {
        console.error("[Server] No saved project config found. Call 'generate-swagger-json' with a projectName and swaggerUrl to get started.");
    }
}

main().catch(async (error) => {
    console.error("Fatal error starting server:", error);
    await cleanup(1);
});
