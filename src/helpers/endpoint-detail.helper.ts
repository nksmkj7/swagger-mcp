import type { OpenApiSpec } from "../types/openapi.types";
import type {
    EndpointDetail,
    EndpointLookupResult,
    ParameterDetail,
    RequestBodyDetail,
    ResponseDetail,
} from "../types/endpoint.types";

export type {
    EndpointDetail,
    EndpointLookupResult,
    ParameterDetail,
    RequestBodyDetail,
    ResponseDetail,
};

// ─── $ref resolution ─────────────────────────────────────────────────────────

/**
 * Resolves a JSON Pointer like "#/components/schemas/Foo" into the actual
 * object inside the spec. Returns undefined if the path does not exist.
 */
function resolveRef(spec: OpenApiSpec, ref: string): Record<string, unknown> | undefined {
    if (!ref.startsWith("#/")) return undefined;

    const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
    let current: unknown = spec;

    for (const part of parts) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[part];
    }

    return typeof current === "object" && current !== null
        ? (current as Record<string, unknown>)
        : undefined;
}

/**
 * Recursively resolves all $ref occurrences inside a schema object.
 * Tracks visited refs to prevent infinite loops from circular references.
 */
function resolveSchema(
    schema: unknown,
    spec: OpenApiSpec,
    visited: Set<string> = new Set(),
    depth = 0,
): Record<string, unknown> {
    if (depth > 10 || schema == null || typeof schema !== "object") {
        return (schema as Record<string, unknown>) ?? {};
    }

    const obj = schema as Record<string, unknown>;

    // If this node IS a $ref, resolve it and recurse into the result
    if (typeof obj["$ref"] === "string") {
        const ref = obj["$ref"] as string;
        if (visited.has(ref)) {
            return { $ref: ref, note: "circular reference" };
        }
        const resolved = resolveRef(spec, ref);
        if (!resolved) return { $ref: ref, note: "unresolved" };

        visited.add(ref);
        const result = resolveSchema(resolved, spec, visited, depth + 1);
        visited.delete(ref);
        return result;
    }

    // Recursively resolve every value in the object
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (Array.isArray(value)) {
            result[key] = value.map((item) =>
                typeof item === "object" && item !== null
                    ? resolveSchema(item, spec, visited, depth + 1)
                    : item,
            );
        } else if (typeof value === "object" && value !== null) {
            result[key] = resolveSchema(value, spec, visited, depth + 1);
        } else {
            result[key] = value;
        }
    }
    return result;
}

// ─── Parameter extraction ─────────────────────────────────────────────────────

function extractParameters(
    rawParams: unknown[],
    spec: OpenApiSpec,
): { path: ParameterDetail[]; query: ParameterDetail[]; header: ParameterDetail[] } {
    const path: ParameterDetail[] = [];
    const query: ParameterDetail[] = [];
    const header: ParameterDetail[] = [];

    for (const raw of rawParams) {
        if (!raw || typeof raw !== "object") continue;
        const p = raw as Record<string, unknown>;

        const resolved = typeof p["$ref"] === "string"
            ? resolveRef(spec, p["$ref"] as string) ?? p
            : p;

        const detail: ParameterDetail = {
            name: String(resolved["name"] ?? ""),
            in: (resolved["in"] as ParameterDetail["in"]) ?? "query",
            required: Boolean(resolved["required"] ?? false),
            description: typeof resolved["description"] === "string"
                ? resolved["description"]
                : undefined,
            schema: resolved["schema"]
                ? resolveSchema(resolved["schema"], spec)
                : {},
        };

        if (detail.in === "path") path.push(detail);
        else if (detail.in === "header") header.push(detail);
        else query.push(detail);
    }

    return { path, query, header };
}

// ─── Request body extraction ──────────────────────────────────────────────────

function extractRequestBody(
    requestBody: unknown,
    spec: OpenApiSpec,
): RequestBodyDetail | undefined {
    if (!requestBody || typeof requestBody !== "object") return undefined;
    const rb = requestBody as Record<string, unknown>;

    const content = rb["content"] as Record<string, unknown> | undefined;
    if (!content) return undefined;

    const contentType = Object.keys(content)[0] ?? "application/json";
    const mediaObject = content[contentType] as Record<string, unknown> | undefined;
    const rawSchema = mediaObject?.["schema"];

    return {
        required: Boolean(rb["required"] ?? false),
        contentType,
        schema: rawSchema ? resolveSchema(rawSchema, spec) : {},
    };
}

// ─── Response extraction ──────────────────────────────────────────────────────

function extractResponses(
    responses: unknown,
    spec: OpenApiSpec,
): ResponseDetail[] {
    if (!responses || typeof responses !== "object") return [];

    const result: ResponseDetail[] = [];

    for (const [statusCode, rawResponse] of Object.entries(
        responses as Record<string, unknown>,
    )) {
        if (!rawResponse || typeof rawResponse !== "object") continue;
        const res = rawResponse as Record<string, unknown>;

        const content = res["content"] as Record<string, unknown> | undefined;
        let contentType: string | undefined;
        let schema: Record<string, unknown> | undefined;

        if (content) {
            contentType = Object.keys(content)[0];
            const mediaObject = content[contentType] as Record<string, unknown> | undefined;
            const rawSchema = mediaObject?.["schema"];
            if (rawSchema) {
                schema = resolveSchema(rawSchema, spec);
            }
        }

        result.push({
            statusCode,
            description: typeof res["description"] === "string" ? res["description"] : "",
            contentType,
            schema,
        });
    }

    return result;
}

// ─── Main exported helper ─────────────────────────────────────────────────────

/**
 * Looks up one or more endpoints in the spec by path and optional HTTP method.
 * Resolves all $ref schemas so the caller gets fully expanded objects.
 *
 * Used by both the endpoint-detail MCP tool and the curl-generation tool.
 */
export function getEndpointDetail(
    spec: OpenApiSpec,
    searchPath: string,
    method?: string,
): EndpointLookupResult {
    const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;

    if (!paths) {
        return {
            found: false,
            message: "The loaded OpenAPI spec has no paths defined.",
            availablePaths: [],
        };
    }

    // Normalise: strip trailing slash, ensure leading slash
    const normalise = (p: string) =>
        "/" + p.replace(/^\/+|\/+$/g, "").toLowerCase();

    const searchNorm = normalise(searchPath);

    // Find all matching path keys (case-insensitive, trailing-slash tolerant)
    const matchingKeys = Object.keys(paths).filter(
        (k) => normalise(k) === searchNorm,
    );

    if (matchingKeys.length === 0) {
        const availablePaths = Object.keys(paths).sort();
        return {
            found: false,
            message: `No endpoint found matching path "${searchPath}".`,
            availablePaths,
        };
    }

    const HTTP_METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];
    const methodFilter = method?.toLowerCase();

    const endpoints: EndpointDetail[] = [];

    for (const pathKey of matchingKeys) {
        const pathItem = paths[pathKey] as Record<string, unknown>;

        for (const op of HTTP_METHODS) {
            if (methodFilter && op !== methodFilter) continue;
            const operation = pathItem[op];
            if (!operation || typeof operation !== "object") continue;

            const rawOp = operation as Record<string, unknown>;
            const rawParams = Array.isArray(rawOp["parameters"])
                ? (rawOp["parameters"] as unknown[])
                : [];

            // Merge path-level parameters with operation-level parameters
            const pathLevelParams = Array.isArray(pathItem["parameters"])
                ? (pathItem["parameters"] as unknown[])
                : [];
            const allParams = [...pathLevelParams, ...rawParams];

            const { path: pathParams, query, header } = extractParameters(allParams, spec);
            const tags = Array.isArray(rawOp["tags"])
                ? (rawOp["tags"] as string[])
                : [];

            endpoints.push({
                method: op.toUpperCase(),
                path: pathKey,
                operationId: typeof rawOp["operationId"] === "string"
                    ? rawOp["operationId"]
                    : undefined,
                summary: typeof rawOp["summary"] === "string"
                    ? rawOp["summary"]
                    : undefined,
                description: typeof rawOp["description"] === "string"
                    ? rawOp["description"]
                    : undefined,
                tag: tags[0],
                pathParameters: pathParams,
                queryParameters: query,
                headerParameters: header,
                requestBody: extractRequestBody(rawOp["requestBody"], spec),
                responses: extractResponses(rawOp["responses"], spec),
            });
        }
    }

    if (endpoints.length === 0) {
        return {
            found: false,
            message: method
                ? `Path "${searchPath}" exists but has no "${method.toUpperCase()}" operation.`
                : `Path "${searchPath}" exists but has no operations.`,
            availablePaths: Object.keys(paths).sort(),
        };
    }

    return { found: true, endpoints };
}
