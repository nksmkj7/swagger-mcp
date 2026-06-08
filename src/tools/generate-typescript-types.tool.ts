import { z } from "zod";
import { ToolCharacteristics } from "../types";
import { getEndpointDetail } from "../helpers/endpoint-detail.helper";
import {
    generateTypescriptTypes,
    type GeneratePart,
    type OutputStyle,
} from "../helpers/typescript-type-builder.helper";
import { getProjectState, PROJECT_NOT_SET_MESSAGE } from "../state/project.state";
import { loadLatestOpenApiFromDoc } from "../utility/swagger.utility";

const VALID_PARTS: GeneratePart[] = [
    "requestBody",
    "pathParams",
    "queryParams",
    "responseBody",
];

export const generateTypescriptTypesTool: ToolCharacteristics<
    {
        path: string;
        method: string;
        generate: GeneratePart[];
        outputStyle: OutputStyle;
        responseCodes?: string[];
    },
    Record<string, unknown>
> = {
    name: "generate-typescript-types",
    title: "Generate TypeScript types for an API endpoint",
    description:
        "Generates TypeScript declarations for a given API endpoint. " +
        "Choose which parts to generate: requestBody, pathParams, queryParams, responseBody. " +
        "Choose the declaration style: 'interface' (export interface) or 'type' (export type = ...). " +
        "Unions, enums, and non-object bodies always use 'type' regardless of style. " +
        "For responseBody you can also filter by specific status codes (e.g. ['200', '201']). " +
        "All $ref schemas are fully resolved so the output is self-contained with no imports needed.",
    inputSchema: z.object({
        path: z
            .string()
            .describe("API path, e.g. '/auth/register' or '/users/provider/{providerId}'"),
        method: z
            .string()
            .describe("HTTP method: GET, POST, PUT, PATCH, DELETE"),
        generate: z
            .array(z.enum(["requestBody", "pathParams", "queryParams", "responseBody"]))
            .min(1)
            .describe(
                "Which parts to generate types for. " +
                "Options: requestBody, pathParams, queryParams, responseBody. " +
                "Pass all four to generate everything.",
            ),
        outputStyle: z
            .enum(["interface", "type"])
            .default("interface")
            .describe(
                "Declaration style. " +
                "'interface' uses `export interface Name { ... }` for object shapes. " +
                "'type' uses `export type Name = { ... }` for every shape. " +
                "Unions, enums, and arrays always use 'type' regardless of this setting.",
            ),
        responseCodes: z
            .array(z.string())
            .optional()
            .describe(
                "Filter response types by status code, e.g. ['200', '201']. " +
                "Omit to generate types for all response codes.",
            ),
    }),
    outputSchema: z.object({}).passthrough(),
    execute: async ({ path: searchPath, method, generate, outputStyle, responseCodes }) => {
        const project = getProjectState();
        if (!project) {
            return { error: PROJECT_NOT_SET_MESSAGE };
        }

        const spec = await loadLatestOpenApiFromDoc();
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

        // Warn about requested parts that have no data
        const warnings: string[] = [];
        if (generate.includes("pathParams") && endpoint.pathParameters.length === 0) {
            warnings.push("'pathParams' requested but this endpoint has no path parameters.");
        }
        if (generate.includes("queryParams") && endpoint.queryParameters.length === 0) {
            warnings.push("'queryParams' requested but this endpoint has no query parameters.");
        }
        if (generate.includes("requestBody") && !endpoint.requestBody) {
            warnings.push("'requestBody' requested but this endpoint has no request body.");
        }
        if (generate.includes("responseBody") && endpoint.responses.length === 0) {
            warnings.push("'responseBody' requested but this endpoint has no documented responses.");
        }

        const { types, fullOutput } = generateTypescriptTypes(
            endpoint,
            generate,
            outputStyle,
            responseCodes,
        );

        if (types.length === 0) {
            return {
                found: true,
                projectName: project.projectName,
                method: endpoint.method,
                path: endpoint.path,
                types: [],
                fullOutput: "",
                warnings: warnings.length > 0 ? warnings : ["No types could be generated for the selected parts."],
            };
        }

        return {
            found: true,
            projectName: project.projectName,
            method: endpoint.method,
            path: endpoint.path,
            generated: types.map((t) => ({ part: t.part, name: t.name })),
            fullOutput,
            warnings: warnings.length > 0 ? warnings : undefined,
        };
    },
};

export default generateTypescriptTypesTool;
