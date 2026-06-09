import { z } from "zod";
import { ToolCharacteristics } from "../types";
import { getEndpointDetail } from "../helpers/endpoint-detail.helper";
import {
    getProjectState,
    PROJECT_NOT_SET_MESSAGE,
} from "../state/project.state";
import { loadOpenApiFromPath } from "../utility/swagger.utility";

export const endpointDetailTool: ToolCharacteristics<
    { path: string; method?: string },
    Record<string, unknown>
> = {
    name: "endpoint-detail",
    title: "Get full details of an API endpoint",
    description:
        "Returns complete details for a given API endpoint path: path parameters, query parameters, " +
        "request headers, request body schema (with all $ref schemas fully resolved), and all response formats. " +
        "Optionally filter by HTTP method. Use this before generating a curl command or building a request payload.",
    inputSchema: z.object({
        path: z
            .string()
            .describe(
                "The API path to look up, e.g. '/auth/register' or '/users/provider/{providerId}'",
            ),
        method: z
            .string()
            .optional()
            .describe(
                "Optional HTTP method filter: GET, POST, PUT, PATCH, DELETE. If omitted, all methods for the path are returned.",
            ),
    }),
    outputSchema: z.object({}).passthrough(),
    execute: async ({ path: searchPath, method }) => {
        const project = getProjectState();
        if (!project) {
            return { error: PROJECT_NOT_SET_MESSAGE };
        }

        const spec = await loadOpenApiFromPath(project.savedPath);
        const result = getEndpointDetail(spec, searchPath, method);

        if (!result.found) {
            return {
                found: false,
                message: result.message,
                hint: "Use 'available-api-endpoints' to browse all grouped endpoints.",
                availablePaths: result.availablePaths.slice(0, 50),
            };
        }

        return {
            found: true,
            projectName: project.projectName,
            endpoints: result.endpoints,
        };
    },
};

export default endpointDetailTool;
