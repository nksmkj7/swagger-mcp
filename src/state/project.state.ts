import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectEntry = {
    projectName: string;
    jsonUrl: string;
    /** Absolute path to the saved OpenAPI JSON file on disk */
    savedPath: string;
    savedAt: string;
};

export type ProjectConfig = {
    activeProject: string;
    projects: Record<string, ProjectEntry>;
};

// Keep old single-project shape around for migration detection only
type LegacyConfig = {
    projectName: string;
    jsonUrl: string;
    savedAt?: string;
};

// Backward-compat alias used by callers that only need name + url
export type ProjectState = Pick<ProjectEntry, "projectName" | "jsonUrl" | "savedPath">;

// ─── Config file ──────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
const CONFIG_PATH = path.join(PROJECT_ROOT, "doc", ".project-config.json");

// ─── In-memory state ──────────────────────────────────────────────────────────

let config: ProjectConfig | null = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isLegacyConfig(v: unknown): v is LegacyConfig {
    return (
        typeof v === "object" &&
        v !== null &&
        "projectName" in v &&
        "jsonUrl" in v &&
        !("projects" in v)
    );
}

function isProjectConfig(v: unknown): v is ProjectConfig {
    return (
        typeof v === "object" &&
        v !== null &&
        "activeProject" in v &&
        "projects" in v &&
        typeof (v as ProjectConfig).activeProject === "string" &&
        typeof (v as ProjectConfig).projects === "object"
    );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Adds or updates a project entry and marks it as the active project.
 * Called after a successful generate-swagger-json.
 */
export function setProjectState(
    projectName: string,
    jsonUrl: string,
    savedPath: string,
): void {
    if (!config) {
        config = { activeProject: projectName, projects: {} };
    }
    config.projects[projectName] = {
        projectName,
        jsonUrl,
        savedPath,
        savedAt: new Date().toISOString(),
    };
    config.activeProject = projectName;
}

/**
 * Returns the currently active project entry, or null if nothing is configured.
 */
export function getProjectState(): ProjectState | null {
    if (!config) return null;
    const entry = config.projects[config.activeProject];
    if (!entry) return null;
    return { projectName: entry.projectName, jsonUrl: entry.jsonUrl, savedPath: entry.savedPath };
}

/**
 * Returns all registered projects as an array, marking which is active.
 */
export function getAllProjects(): Array<ProjectEntry & { isActive: boolean }> {
    if (!config) return [];
    return Object.values(config.projects).map((p) => ({
        ...p,
        isActive: p.projectName === config!.activeProject,
    }));
}

/**
 * Switches the active project to `projectName`.
 * Returns false if the project is not registered.
 */
export function switchProject(projectName: string): boolean {
    if (!config) return false;
    if (!config.projects[projectName]) return false;
    config.activeProject = projectName;
    return true;
}

export function isProjectStateSet(): boolean {
    return getProjectState() !== null;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export async function persistProjectState(): Promise<void> {
    if (!config) return;
    await mkdir(path.dirname(CONFIG_PATH), { recursive: true });
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

/**
 * Reads doc/.project-config.json on server startup.
 * Handles both the new multi-project format and the legacy single-project format.
 * Returns the active ProjectEntry, or null if nothing is configured.
 */
export async function loadProjectStateFromFile(): Promise<ProjectState | null> {
    try {
        const raw = await readFile(CONFIG_PATH, "utf-8");
        const parsed = JSON.parse(raw) as unknown;

        if (isProjectConfig(parsed)) {
            config = parsed;
            return getProjectState();
        }

        // Migrate legacy single-project format
        if (isLegacyConfig(parsed)) {
            const entry: ProjectEntry = {
                projectName: parsed.projectName,
                jsonUrl: parsed.jsonUrl,
                savedPath: "",  // unknown — will fallback to latest-file scan
                savedAt: parsed.savedAt ?? new Date().toISOString(),
            };
            config = {
                activeProject: parsed.projectName,
                projects: { [parsed.projectName]: entry },
            };
            // Persist the migrated format immediately
            await persistProjectState();
            return getProjectState();
        }

        return null;
    } catch {
        return null;
    }
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export const PROJECT_NOT_SET_MESSAGE =
    "No active project. Use 'list-projects' to see registered projects, " +
    "'switch-project' to activate one, or 'generate-swagger-json' to add a new one.";
