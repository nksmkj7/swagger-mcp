import { z } from "zod";
import { ToolCharacteristics } from "../types";
import { persistProjectState, setProjectState } from "../state/project.state";
import { fetchAndSaveOpenApiToDoc } from "../utility/swagger.utility";

export const generateSwaggerJsonTool: ToolCharacteristics<
    { projectName: string; swaggerUrl: string },
    {
        projectName: string;
        swaggerUrl: string;
        jsonUrl: string;
        savedPath: string;
        groupedPath: string;
        title?: string;
        version?: string;
        pathCount: number;
    }
> = {
    name: "generate-swagger-json",
    title: "Initialise project and fetch OpenAPI JSON",
    description:
        "Sets up the project context and downloads the OpenAPI/Swagger JSON spec from the given URL, saving it under doc/. " +
        "Must be called before any other tool. Requires a projectName (your identifier for this API) and a swaggerUrl " +
        "(must be the direct JSON endpoint URL, e.g. https://api.example.com/api-docs-json or /v3/api-docs — " +
        "not the Swagger UI HTML page). If unsure, open the Swagger UI in a browser and copy the URL shown in the top search bar of the UI.",
    inputSchema: z.object({
        projectName: z
            .string()
            .min(1)
            .describe(
                "A short name to identify this API project (e.g. 'example-api', 'payments-service')",
            ),
        swaggerUrl: z
            .string()
            .url()
            .describe(
                "Swagger UI or direct OpenAPI JSON URL (e.g. https://api.example.com/api-docs/ or https://api.example.com/api-docs-json)",
            ),
    }),
    outputSchema: z.object({
        projectName: z.string(),
        swaggerUrl: z.string(),
        jsonUrl: z.string(),
        savedPath: z.string(),
        groupedPath: z.string(),
        title: z.string().optional(),
        version: z.string().optional(),
        pathCount: z.number(),
    }),
    execute: async ({ projectName, swaggerUrl }) => {
        const { spec, savedPath, groupedPath, jsonUrl } =
            await fetchAndSaveOpenApiToDoc(swaggerUrl);

        setProjectState(projectName, jsonUrl, savedPath);
        await persistProjectState();

        const paths = spec.paths as Record<string, unknown> | undefined;

        return {
            projectName,
            swaggerUrl,
            jsonUrl,
            savedPath,
            groupedPath,
            title: spec.info?.title,
            version: spec.info?.version,
            pathCount: paths ? Object.keys(paths).length : 0,
        };
    },
};

export default generateSwaggerJsonTool;
