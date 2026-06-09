import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { GroupedEndpoints, IEndPoint } from "../types/endpoint.types";
import { HttpMethod } from "../types/endpoint.types";
import { isOpenApiSpec, OpenApiSpec } from "../types/openapi.types";

// Anchor to the project root regardless of where the process was spawned from.
const PROJECT_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
const DOC_DIR = path.join(PROJECT_ROOT, "doc");

function specFileName(spec: OpenApiSpec, sourceUrl?: string): string {
    const title =
        spec.info?.title?.replace(/[^a-z0-9.-]/gi, "-").toLowerCase() ??
        "openapi";
    const version =
        spec.info?.version?.replace(/[^a-z0-9.-]/gi, "-") ?? "1.0.0";
    const host = sourceUrl
        ? `${new URL(sourceUrl).hostname.replace(/[^a-z0-9.-]/gi, "-")}-`
        : "";
    return `${host}${title}-${version}.json`;
}

export async function fetchOpenApiFromSwaggerUrl(
    swaggerUrl: string,
): Promise<{ spec: OpenApiSpec; jsonUrl: string }> {
    // Strip the hash fragment — it is a browser-only anchor and is never sent
    // to the server. e.g. https://api.example.com/api-docs/#/user/Login
    //                   → https://api.example.com/api-docs/
    const jsonUrl = swaggerUrl.split("#")[0];

    const response = await fetch(jsonUrl, {
        headers: { Accept: "application/json" },
    });

    if (!response.ok) {
        throw new Error(
            `Request failed with ${response.status} ${response.statusText}.\n` +
            `URL: ${jsonUrl}\n` +
            `Please check the URL is correct and the server is reachable.`,
        );
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("html")) {
        throw new Error(
            `The URL returned an HTML page (likely the Swagger UI browser interface), not the raw OpenAPI JSON.\n` +
            `URL: ${jsonUrl}\n\n` +
            `Please provide the direct JSON spec URL instead.\n` +
            `You can find it by opening the Swagger UI in a browser, looking at the URL in the top search bar of the UI, ` +
            `or checking the network tab for a request that returns JSON with an "openapi" or "swagger" field.`,
        );
    }

    let data: unknown;
    try {
        data = await response.json();
    } catch {
        throw new Error(
            `The URL responded with Content-Type "${contentType}" but the body is not valid JSON.\n` +
            `URL: ${jsonUrl}\n\n` +
            `Please provide the direct OpenAPI JSON endpoint URL.`,
        );
    }

    if (!isOpenApiSpec(data)) {
        throw new Error(
            `The URL returned valid JSON but it is not an OpenAPI document ` +
            `(missing top-level "openapi" or "swagger" field).\n` +
            `URL: ${jsonUrl}\n\n` +
            `Please check you are pointing to the spec endpoint, not an API response or other JSON file.`,
        );
    }

    return { spec: data, jsonUrl };
}

export async function saveOpenApiSpecToDoc(
    spec: OpenApiSpec,
    sourceUrl?: string,
): Promise<string> {
    await mkdir(DOC_DIR, { recursive: true });
    const fileName = specFileName(spec, sourceUrl);
    const filePath = path.join(DOC_DIR, fileName);
    await writeFile(filePath, JSON.stringify(spec, null, 2), "utf-8");
    return filePath;
}

export async function fetchAndSaveOpenApiToDoc(
    swaggerUrl: string,
): Promise<{
    spec: OpenApiSpec;
    savedPath: string;
    groupedPath: string;
    jsonUrl: string;
}> {
    const { spec, jsonUrl } = await fetchOpenApiFromSwaggerUrl(swaggerUrl);
    const savedPath = await saveOpenApiSpecToDoc(spec, jsonUrl);
    const groupedPath = await saveGroupedEndpointsToDoc(spec, jsonUrl);
    return { spec, savedPath, groupedPath, jsonUrl };
}

export function getDocDir(): string {
    return DOC_DIR;
}

const HTTP_METHODS = new Set<string>(Object.values(HttpMethod));

export function extractEndpointsFromSpec(spec: OpenApiSpec): IEndPoint[] {
    const paths = spec.paths as
        | Record<string, Record<string, unknown>>
        | undefined;
    if (!paths) return [];

    const endpoints: IEndPoint[] = [];

    for (const [pathPattern, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== "object") continue;

        for (const [method, operation] of Object.entries(pathItem)) {
            const upperMethod = method.toUpperCase();
            if (!HTTP_METHODS.has(upperMethod)) continue;

            const op =
                operation && typeof operation === "object"
                    ? (operation as Record<string, unknown>)
                    : {};

            const tags = Array.isArray(op.tags) ? (op.tags as string[]) : [];
            const tag = tags[0] ?? "untagged";

            endpoints.push({
                method: upperMethod,
                path: pathPattern,
                summary: String(op.summary ?? op.operationId ?? pathPattern),
                description:
                    typeof op.description === "string"
                        ? op.description
                        : undefined,
                tag,
            });
        }
    }

    return endpoints;
}

export function groupEndpointsByTag(endpoints: IEndPoint[]): GroupedEndpoints {
    const groups: GroupedEndpoints = {};

    for (const endpoint of endpoints) {
        if (!groups[endpoint.tag]) {
            groups[endpoint.tag] = [];
        }
        groups[endpoint.tag].push(endpoint);
    }

    return groups;
}

export async function saveGroupedEndpointsToDoc(
    spec: OpenApiSpec,
    sourceUrl?: string,
): Promise<string> {
    await mkdir(DOC_DIR, { recursive: true });

    const endpoints = extractEndpointsFromSpec(spec);
    const groups = groupEndpointsByTag(endpoints);

    const base = specFileName(spec, sourceUrl).replace(/\.json$/, "");
    const filePath = path.join(DOC_DIR, `${base}-grouped.json`);

    const output = {
        title: spec.info?.title,
        version: spec.info?.version,
        totalEndpoints: endpoints.length,
        groups,
    };

    await writeFile(filePath, JSON.stringify(output, null, 2), "utf-8");
    return filePath;
}

export async function loadLatestOpenApiFromDoc(): Promise<OpenApiSpec> {
    await mkdir(DOC_DIR, { recursive: true });
    const files = (await readdir(DOC_DIR))
        .filter((f) => f.endsWith(".json") && !f.endsWith("-grouped.json") && f !== ".project-config.json")
        .sort();

    if (files.length === 0) {
        throw new Error(
            'No OpenAPI spec found in doc/. Run the "generate-swagger-json" tool first.',
        );
    }

    const latest = files[files.length - 1];
    const raw = await readFile(path.join(DOC_DIR, latest), "utf-8");
    const spec = JSON.parse(raw) as unknown;
    if (!isOpenApiSpec(spec)) {
        throw new Error(`Invalid OpenAPI document: doc/${latest}`);
    }
    return spec;
}

/**
 * Loads the OpenAPI spec for a specific project by its saved file path.
 * Falls back to loadLatestOpenApiFromDoc() when savedPath is empty (migrated legacy projects).
 */
export async function loadOpenApiFromPath(savedPath: string): Promise<OpenApiSpec> {
    if (!savedPath) {
        return loadLatestOpenApiFromDoc();
    }
    try {
        const raw = await readFile(savedPath, "utf-8");
        const spec = JSON.parse(raw) as unknown;
        if (!isOpenApiSpec(spec)) {
            throw new Error(`Invalid OpenAPI document at: ${savedPath}`);
        }
        return spec;
    } catch (err: unknown) {
        const isNotFound =
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as NodeJS.ErrnoException).code === "ENOENT";

        if (isNotFound) {
            throw new Error(
                `Spec file not found: ${savedPath}\n` +
                `The project may have been set up on a different machine. ` +
                `Run "generate-swagger-json" again to re-download the spec.`,
            );
        }
        throw err;
    }
}

export async function listGroupedEndpointsFromDoc(): Promise<GroupedEndpoints> {
    const spec = await loadLatestOpenApiFromDoc();
    const endpoints = extractEndpointsFromSpec(spec);
    return groupEndpointsByTag(endpoints);
}

export async function listEndpointsFromDoc(): Promise<IEndPoint[]> {
    const spec = await loadLatestOpenApiFromDoc();
    return extractEndpointsFromSpec(spec);
}
