import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectState = {
    projectName: string;
    jsonUrl: string;
};

type MutableProjectState = {
    projectName: string | null;
    jsonUrl: string | null;
};

// ─── Config file ──────────────────────────────────────────────────────────────

// Anchor to the project root using the file's own location (immune to cwd changes
// when the server is spawned by Claude Desktop or other external processes).
const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "doc", ".project-config.json");

// ─── In-memory state ──────────────────────────────────────────────────────────

const state: MutableProjectState = {
    projectName: null,
    jsonUrl: null,
};

// ─── Getters / setters ────────────────────────────────────────────────────────

export function setProjectState(projectName: string, jsonUrl: string): void {
    state.projectName = projectName;
    state.jsonUrl = jsonUrl;
}

export function getProjectState(): ProjectState | null {
    if (!state.projectName || !state.jsonUrl) return null;
    return { projectName: state.projectName, jsonUrl: state.jsonUrl };
}

export function isProjectStateSet(): boolean {
    return state.projectName !== null && state.jsonUrl !== null;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Writes the current in-memory state to doc/.project-config.json.
 * Called after a successful generate-swagger-json so the config survives restarts.
 */
export async function persistProjectState(): Promise<void> {
    const project = getProjectState();
    if (!project) return;

    await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await writeFile(
        CONFIG_PATH,
        JSON.stringify({ ...project, savedAt: new Date().toISOString() }, null, 2),
        "utf-8",
    );
}

/**
 * Reads doc/.project-config.json on server startup and restores the state.
 * Returns the loaded state if found and valid, or null if not configured yet.
 */
export async function loadProjectStateFromFile(): Promise<ProjectState | null> {
    try {
        const raw = await readFile(CONFIG_PATH, "utf-8");
        const parsed = JSON.parse(raw) as unknown;

        if (
            parsed &&
            typeof parsed === "object" &&
            typeof (parsed as Record<string, unknown>)["projectName"] === "string" &&
            typeof (parsed as Record<string, unknown>)["jsonUrl"] === "string"
        ) {
            const { projectName, jsonUrl } = parsed as ProjectState;
            setProjectState(projectName, jsonUrl);
            return { projectName, jsonUrl };
        }

        return null;
    } catch {
        // File doesn't exist or is malformed — treat as unconfigured
        return null;
    }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export const PROJECT_NOT_SET_MESSAGE =
    "Project is not initialised. Please run the 'generate-swagger-json' tool " +
    "with a projectName and swaggerUrl to get started.";
