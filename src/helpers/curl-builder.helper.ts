import type { EndpointDetail, ParameterDetail } from "../types/endpoint.types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CurlOptions = {
    /** Base URL of the server, e.g. https://api.abc.co */
    baseUrl: string;
    /** Values to fill path parameters, e.g. { providerId: "123" } */
    pathParams?: Record<string, string>;
    /** Extra query parameters to add or override */
    queryParams?: Record<string, string>;
    /** Headers to include, e.g. { Authorization: "Bearer <token>" } */
    headers?: Record<string, string>;
    /** Override the request body JSON (stringified object) */
    body?: Record<string, unknown>;
    /** Include -v (verbose) flag */
    verbose?: boolean;
};

export type CurlResult = {
    curl: string;
    notes: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Produces a placeholder value for a JSON schema field so the generated
 * body is immediately usable for testing.
 */
function placeholderValue(
    name: string,
    schema: Record<string, unknown>,
): unknown {
    const type = schema["type"] as string | undefined;
    const format = schema["format"] as string | undefined;

    if (schema["example"] !== undefined) return schema["example"];
    if (schema["default"] !== undefined) return schema["default"];
    if (schema["enum"] && Array.isArray(schema["enum"]))
        return schema["enum"][0];

    if (type === "integer" || type === "number") return 1;
    if (type === "boolean") return true;
    if (type === "array") return [];
    if (type === "object") return {};

    // string sub-types
    if (format === "email") return `user@example.com`;
    if (format === "date") return "2024-01-01";
    if (format === "date-time") return "2024-01-01T00:00:00Z";
    if (format === "uuid") return "00000000-0000-0000-0000-000000000000";
    if (format === "password") return "password123";
    if (format === "uri" || format === "url") return "https://example.com";

    // name heuristics
    const lower = name.toLowerCase();
    if (lower.includes("email")) return "user@example.com";
    if (lower.includes("password")) return "password123";
    if (lower.includes("phone")) return "+1234567890";
    if (lower.includes("name")) return "John Doe";
    if (lower.includes("url") || lower.includes("link"))
        return "https://example.com";
    if (lower.includes("id")) return "1";
    if (lower.includes("date")) return "2024-01-01";
    if (lower.includes("token")) return "<token>";

    return `<${name}>`;
}

/**
 * Builds a sample JSON body object from a resolved schema.
 * Handles: properties, allOf, oneOf, anyOf.
 */
function buildSampleBody(
    schema: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Merge allOf / anyOf / oneOf into a flat property list
    const merged: Record<string, unknown> = { ...schema };
    for (const key of ["allOf", "anyOf", "oneOf"]) {
        const parts = schema[key];
        if (Array.isArray(parts)) {
            for (const part of parts) {
                if (part && typeof part === "object") {
                    const subSchema = part as Record<string, unknown>;
                    const subProps = subSchema["properties"] as
                        | Record<string, unknown>
                        | undefined;
                    if (subProps) {
                        (merged["properties"] as Record<string, unknown>) = {
                            ...((merged["properties"] as Record<
                                string,
                                unknown
                            >) ?? {}),
                            ...subProps,
                        };
                    }
                }
            }
        }
    }

    const properties = merged["properties"] as
        | Record<string, Record<string, unknown>>
        | undefined;

    if (!properties) return result;

    const required = Array.isArray(merged["required"])
        ? (merged["required"] as string[])
        : [];

    for (const [fieldName, fieldSchema] of Object.entries(properties)) {
        if (fieldSchema["type"] === "object" && fieldSchema["properties"]) {
            result[fieldName] = buildSampleBody(fieldSchema);
        } else if (fieldSchema["type"] === "array" && fieldSchema["items"]) {
            const itemSchema = fieldSchema["items"] as Record<string, unknown>;
            result[fieldName] = [
                itemSchema["type"] === "object"
                    ? buildSampleBody(itemSchema)
                    : placeholderValue(fieldName, itemSchema),
            ];
        } else {
            result[fieldName] = placeholderValue(fieldName, fieldSchema);
        }
    }

    // Note fields that are required so caller can highlight them
    void required;
    return result;
}

/**
 * Replaces {param} placeholders in a path template.
 * Falls back to "<paramName>" if no value provided.
 */
function fillPathParams(
    pathTemplate: string,
    pathParameters: ParameterDetail[],
    supplied: Record<string, string>,
): { filledPath: string; missing: string[] } {
    let filledPath = pathTemplate;
    const missing: string[] = [];

    for (const param of pathParameters) {
        const value =
            supplied[param.name] ?? supplied[param.name.toLowerCase()];
        if (value) {
            filledPath = filledPath.replace(
                new RegExp(`\\{${param.name}\\}`, "gi"),
                encodeURIComponent(value),
            );
        } else {
            missing.push(param.name);
            filledPath = filledPath.replace(
                new RegExp(`\\{${param.name}\\}`, "gi"),
                `<${param.name}>`,
            );
        }
    }

    return { filledPath, missing };
}

// ─── Main exported function ───────────────────────────────────────────────────

export function buildCurl(
    endpoint: EndpointDetail,
    options: CurlOptions,
): CurlResult {
    const notes: string[] = [];

    // 1. Resolve path
    const { filledPath, missing: missingPathParams } = fillPathParams(
        endpoint.path,
        endpoint.pathParameters,
        options.pathParams ?? {},
    );

    if (missingPathParams.length > 0) {
        notes.push(
            `Path parameter(s) not supplied — replace placeholder(s): ${missingPathParams.map((p) => `<${p}>`).join(", ")}`,
        );
    }

    // 2. Build query string
    const queryParts: string[] = [];

    for (const qp of endpoint.queryParameters) {
        const supplied = options.queryParams?.[qp.name];
        if (supplied !== undefined) {
            queryParts.push(
                `${encodeURIComponent(qp.name)}=${encodeURIComponent(supplied)}`,
            );
        } else if (qp.required) {
            queryParts.push(`${encodeURIComponent(qp.name)}=<${qp.name}>`);
            notes.push(
                `Required query parameter "${qp.name}" has no value — replace <${qp.name}>.`,
            );
        }
        // optional and not supplied → omit (clean curl)
    }

    // Any extra query params the caller wants to force in
    for (const [k, v] of Object.entries(options.queryParams ?? {})) {
        const alreadyAdded = endpoint.queryParameters.some(
            (qp) => qp.name === k,
        );
        if (!alreadyAdded) {
            queryParts.push(
                `${encodeURIComponent(k)}=${encodeURIComponent(v)}`,
            );
        }
    }

    const queryString = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";

    // 3. Compose URL
    const baseUrl = options.baseUrl.replace(/\/+$/, "");
    const fullUrl = `${baseUrl}${filledPath}${queryString}`;

    // 4. Build curl parts
    const parts: string[] = ["curl"];

    if (options.verbose) parts.push("-v");

    parts.push(`-X ${endpoint.method}`);
    parts.push(`"${fullUrl}"`);

    // 5. Headers
    const mergedHeaders: Record<string, string> = {};

    // Content-Type from request body
    if (endpoint.requestBody) {
        mergedHeaders["Content-Type"] = endpoint.requestBody.contentType;
    }

    // Headers defined in spec as required
    for (const hp of endpoint.headerParameters) {
        if (hp.required) {
            mergedHeaders[hp.name] =
                options.headers?.[hp.name] ?? `<${hp.name}>`;
            if (!options.headers?.[hp.name]) {
                notes.push(
                    `Required header "${hp.name}" has no value — replace <${hp.name}>.`,
                );
            }
        }
    }

    // Caller-supplied headers override everything
    for (const [k, v] of Object.entries(options.headers ?? {})) {
        mergedHeaders[k] = v;
    }

    for (const [k, v] of Object.entries(mergedHeaders)) {
        parts.push(`-H "${k}: ${v}"`);
    }

    // 6. Request body
    if (endpoint.requestBody) {
        const body =
            options.body ?? buildSampleBody(endpoint.requestBody.schema);
        const bodyJson = JSON.stringify(body, null, 2);

        if (!options.body) {
            notes.push(
                "Request body is auto-generated from the schema — review and replace placeholder values before use.",
            );
        }

        parts.push(`-d '${bodyJson}'`);
    }

    // 7. Join with line-continuation for readability
    const curl = parts.join(" \\\n  ");

    return { curl, notes };
}
