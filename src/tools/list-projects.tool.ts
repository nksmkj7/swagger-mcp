import { z } from "zod";
import { ToolCharacteristics } from "../types";
import { getAllProjects, getProjectState } from "../state/project.state";

export const listProjectsTool: ToolCharacteristics<
    Record<string, never>,
    Record<string, unknown>
> = {
    name: "list-projects",
    title: "List all registered API projects",
    description:
        "Returns all API projects that have been set up via generate-swagger-json. " +
        "Shows the project name, JSON URL, saved spec path, when it was registered, " +
        "and which project is currently active. " +
        "Use switch-project to change the active project.",
    inputSchema: z.object({}),
    outputSchema: z.object({}).passthrough(),
    execute: async () => {
        const projects = getAllProjects();

        if (projects.length === 0) {
            return {
                totalProjects: 0,
                activeProject: null,
                projects: [],
                hint: "No projects registered yet. Call 'generate-swagger-json' with a projectName and swaggerUrl to get started.",
            };
        }

        const active = getProjectState();

        return {
            totalProjects: projects.length,
            activeProject: active?.projectName ?? null,
            projects: projects.map((p) => ({
                projectName: p.projectName,
                jsonUrl: p.jsonUrl,
                savedPath: p.savedPath || "(path unknown — re-run generate-swagger-json to refresh)",
                savedAt: p.savedAt,
                isActive: p.isActive,
            })),
        };
    },
};

export default listProjectsTool;
