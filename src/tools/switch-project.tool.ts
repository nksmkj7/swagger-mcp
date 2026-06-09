import { z } from "zod";
import { ToolCharacteristics } from "../types";
import { getAllProjects, getProjectState, persistProjectState, switchProject } from "../state/project.state";

export const switchProjectTool: ToolCharacteristics<
    { projectName: string },
    Record<string, unknown>
> = {
    name: "switch-project",
    title: "Switch the active API project",
    description:
        "Switches the active API project context to a previously registered project. " +
        "All subsequent tool calls (available-api-endpoints, endpoint-detail, generate-curl, generate-typescript-types) " +
        "will use the newly activated project's spec. " +
        "Use list-projects to see all available project names.",
    inputSchema: z.object({
        projectName: z
            .string()
            .min(1)
            .describe("The name of the project to activate, e.g. 'medex' or 'staging-swagger-docs'"),
    }),
    outputSchema: z.object({}).passthrough(),
    execute: async ({ projectName }) => {
        const all = getAllProjects();

        if (all.length === 0) {
            return {
                success: false,
                error: "No projects registered. Call 'generate-swagger-json' first.",
            };
        }

        const switched = switchProject(projectName);

        if (!switched) {
            const available = all.map((p) => p.projectName);
            return {
                success: false,
                error: `Project "${projectName}" is not registered.`,
                availableProjects: available,
                hint: "Use one of the available project names above, or call 'generate-swagger-json' to add a new project.",
            };
        }

        await persistProjectState();

        const active = getProjectState();

        return {
            success: true,
            activeProject: active?.projectName,
            jsonUrl: active?.jsonUrl,
            savedPath: active?.savedPath,
            message: `Switched to project "${projectName}". All subsequent tools will now use this project's API spec.`,
        };
    },
};

export default switchProjectTool;
