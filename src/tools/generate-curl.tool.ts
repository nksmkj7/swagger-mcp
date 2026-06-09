import { z } from "zod";
import { ToolCharacteristics } from "../types";
import { getEndpointDetail } from "../helpers/endpoint-detail.helper";
import { buildCurl } from "../helpers/curl-builder.helper";
import { getProjectState, PROJECT_NOT_SET_MESSAGE } from "../state/project.state";
import { loadOpenApiFromPath } from "../utility/swagger.utility";

export const generateCurlTool: ToolCharacteristics<
    {
        path: string;
        method: string;
        baseUrl?: string;
        pathParams?: Record<string, string>;
        queryParams?: Record<string, string>;
        headers?: Record<string, string>;
        body?: Record<string, unknown>;
        verbose?: boolean;
    },
    Record<string, unknown>
> = {
    name: "generate-curl",
    title: "Generate a cURL command for an API endpoint",
    description:
        "Generates a ready-to-run cURL command for a given API endpoint. " +
        "Looks up the endpoint from the saved OpenAPI spec, resolves all path parameters, " +
        "query parameters, headers, and request body (auto-generates sample body values from the schema if not supplied). " +
        "baseUrl is optional — if omitted, the origin of the project's swagger URL is used automatically. " +
        "Returns the curl command and any notes about missing or placeholder values that need to be replaced.",
    inputSchema: z.object({
        path: z
            .string()
            .describe("API path to generate curl for, e.g. '/auth/register' or '/users/provider/{providerId}'"),
        method: z
            .string()
            .describe("HTTP method: GET, POST, PUT, PATCH, DELETE"),
        baseUrl: z
            .string()
            .url()
            .optional()
            .describe("Base URL of the server, e.g. 'https://api.example.com'. If omitted, derived from the project's saved swagger URL."),
        pathParams: z
            .record(z.string())
            .optional()
            .describe("Values for path parameters, e.g. { providerId: '123' }"),
        queryParams: z
            .record(z.string())
            .optional()
            .describe("Query string parameters to include, e.g. { page: '1', limit: '10' }"),
        headers: z
            .record(z.string())
            .optional()
            .describe("Request headers, e.g. { Authorization: 'Bearer <token>' }"),
        body: z
            .record(z.unknown())
            .optional()
            .describe("Override the request body. If omitted, a sample body is auto-generated from the schema."),
        verbose: z
            .boolean()
            .optional()
            .describe("Add -v flag to the curl command for verbose output"),
    }),
    outputSchema: z.object({}).passthrough(),
    execute: async ({ path: searchPath, method, baseUrl, pathParams, queryParams, headers, body, verbose }) => {
        const project = getProjectState();
        if (!project) {
            return { error: PROJECT_NOT_SET_MESSAGE };
        }

        // Derive base URL from the saved jsonUrl origin when not supplied
        const resolvedBaseUrl = baseUrl ?? new URL(project.jsonUrl).origin;

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

        const endpoint = result.endpoints[0];
        const { curl, notes } = buildCurl(endpoint, {
            baseUrl: resolvedBaseUrl,
            pathParams,
            queryParams,
            headers,
            body,
            verbose,
        });

        return {
            found: true,
            projectName: project.projectName,
            baseUrl: resolvedBaseUrl,
            method: endpoint.method,
            path: endpoint.path,
            curl,
            notes,
        };
    },
};

export default generateCurlTool;
