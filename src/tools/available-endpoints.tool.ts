import { z } from "zod";
import type { GroupedEndpoints } from "../types/endpoint.types";
import { ToolCharacteristics } from "../types";
import {
    getProjectState,
    PROJECT_NOT_SET_MESSAGE,
} from "../state/project.state";
import { listGroupedEndpointsFromDoc } from "../utility/swagger.utility";

export const availableApiEndpointsTool: ToolCharacteristics<
    Record<string, never>,
    Record<string, unknown>
> = {
    name: "available-api-endpoints",
    title: "List all available API endpoints grouped by tag",
    description:
        "Returns all API endpoints from the saved OpenAPI spec, grouped by their tag (e.g. 'user', 'provider', 'auth'). " +
        "Each group contains the HTTP method, path, summary, and description of every endpoint in that category. " +
        "Requires generate-swagger-json to have been called first.",
    inputSchema: z.object({}),
    outputSchema: z.object({}).passthrough(),
    execute: async () => {
        const project = getProjectState();

        if (!project) {
            return { error: PROJECT_NOT_SET_MESSAGE };
        }

        const groups = await listGroupedEndpointsFromDoc();
        const totalEndpoints = Object.values(groups).reduce(
            (sum, endpoints) => sum + endpoints.length,
            0,
        );

        return {
            projectName: project.projectName,
            jsonUrl: project.jsonUrl,
            totalEndpoints,
            groups,
        };
    },
};

export default availableApiEndpointsTool;
