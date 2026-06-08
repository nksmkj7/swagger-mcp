import type { EndpointDetail, ParameterDetail } from "../types/endpoint.types";

// ─── Public types ─────────────────────────────────────────────────────────────

export type GeneratePart = "requestBody" | "pathParams" | "queryParams" | "responseBody";

/**
 * "interface" → prefers `export interface Name { ... }` for object shapes.
 * "type"      → always uses `export type Name = ...` for every shape.
 *
 * Note: unions, enums, and primitives always fall back to `type` regardless
 * of the chosen style, because TypeScript interfaces cannot represent them.
 */
export type OutputStyle = "interface" | "type";

export type GeneratedType = {
    part: GeneratePart | string;
    name: string;
    code: string;
};

export type TypeGenerationResult = {
    types: GeneratedType[];
    fullOutput: string;
};

// ─── Name helpers ─────────────────────────────────────────────────────────────

function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function camelCase(s: string): string {
    return s.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase());
}

/**
 * Derives a PascalCase name from an API path.
 * /auth/forgot-password      → AuthForgotPassword
 * /users/provider/{providerId} → UsersProviderByProviderId
 */
function pathToName(path: string): string {
    return path
        .split("/")
        .filter(Boolean)
        .map((segment) => {
            if (segment.startsWith("{") && segment.endsWith("}")) {
                return "By" + capitalize(camelCase(segment.slice(1, -1)));
            }
            return capitalize(camelCase(segment));
        })
        .join("");
}

// ─── Schema → TypeScript type string ─────────────────────────────────────────

/**
 * Recursively converts a resolved JSON Schema object to a TypeScript type string.
 * depth controls indentation for nested objects.
 */
function schemaToTsType(
    schema: Record<string, unknown>,
    required: string[] = [],
    depth = 0,
): string {
    const indent = "  ".repeat(depth);
    const innerIndent = "  ".repeat(depth + 1);

    // Merge allOf / anyOf / oneOf into a single properties map
    for (const combiner of ["allOf", "anyOf", "oneOf"]) {
        const parts = schema[combiner];
        if (Array.isArray(parts)) {
            if (combiner === "anyOf" || combiner === "oneOf") {
                const union = parts
                    .map((p) => schemaToTsType(p as Record<string, unknown>, [], depth))
                    .join(" | ");
                return union;
            }
            // allOf → merge properties
            const merged: Record<string, unknown> = { type: "object", properties: {}, required: [] };
            for (const part of parts) {
                const p = part as Record<string, unknown>;
                Object.assign(
                    (merged["properties"] as Record<string, unknown>),
                    (p["properties"] as Record<string, unknown>) ?? {},
                );
                const req = p["required"];
                if (Array.isArray(req)) {
                    (merged["required"] as string[]).push(...(req as string[]));
                }
            }
            return schemaToTsType(merged, required, depth);
        }
    }

    const type = schema["type"] as string | undefined;

    // Enum → union literal
    if (schema["enum"] && Array.isArray(schema["enum"])) {
        return (schema["enum"] as unknown[])
            .map((v) => (typeof v === "string" ? `"${v}"` : String(v)))
            .join(" | ");
    }

    // Array
    if (type === "array") {
        const items = schema["items"] as Record<string, unknown> | undefined;
        const itemType = items ? schemaToTsType(items, [], depth) : "unknown";
        return `${itemType}[]`;
    }

    // Object
    if (type === "object" || schema["properties"]) {
        const properties = schema["properties"] as
            | Record<string, Record<string, unknown>>
            | undefined;

        if (!properties || Object.keys(properties).length === 0) {
            return "Record<string, unknown>";
        }

        const requiredFields = Array.isArray(schema["required"])
            ? (schema["required"] as string[])
            : required;

        const lines = Object.entries(properties).map(([key, propSchema]) => {
            const isRequired = requiredFields.includes(key);
            const propType = schemaToTsType(propSchema, [], depth + 1);
            const description = typeof propSchema["description"] === "string"
                ? `${innerIndent}/** ${propSchema["description"]} */\n`
                : "";
            return `${description}${innerIndent}${key}${isRequired ? "" : "?"}: ${propType};`;
        });

        return `{\n${lines.join("\n")}\n${indent}}`;
    }

    // Primitives
    if (type === "integer" || type === "number") return "number";
    if (type === "boolean") return "boolean";
    if (type === "null") return "null";
    if (type === "string") {
        const format = schema["format"] as string | undefined;
        if (format === "date" || format === "date-time") return "string"; // keep as string, add comment later
        return "string";
    }

    // Fallback
    return "unknown";
}

// ─── Declaration generators ───────────────────────────────────────────────────

/**
 * Emits a named TypeScript declaration.
 *
 * Rules:
 *  - Object shapes (`body` starts with `{`) can be either `interface` or `type`
 *    depending on `style`.
 *  - Non-object bodies (unions, primitives, arrays) are ALWAYS emitted as `type`
 *    because TypeScript interfaces cannot represent them.
 */
function buildDeclaration(
    name: string,
    body: string,
    style: OutputStyle,
    description?: string,
): string {
    const doc = description ? `/** ${description} */\n` : "";
    const isObjectShape = body.startsWith("{");

    if (isObjectShape && style === "interface") {
        return `${doc}export interface ${name} ${body}\n`;
    }
    // `type` style, or non-object body that must use `type`
    return `${doc}export type ${name} = ${body};\n`;
}

function buildParamsDeclaration(
    name: string,
    params: ParameterDetail[],
    description: string,
    style: OutputStyle,
): string {
    if (params.length === 0) return "";

    const lines = params.map((p) => {
        const tsType = schemaToTsType(p.schema);
        const comment = p.description ? `  /** ${p.description} */\n` : "";
        return `${comment}  ${p.name}${p.required ? "" : "?"}: ${tsType};`;
    });

    return buildDeclaration(name, `{\n${lines.join("\n")}\n}`, style, description);
}

// ─── Main exported function ───────────────────────────────────────────────────

export function generateTypescriptTypes(
    endpoint: EndpointDetail,
    parts: GeneratePart[],
    style: OutputStyle = "interface",
    responseCodes?: string[],
): TypeGenerationResult {
    const baseName = pathToName(endpoint.path);
    const method = capitalize(endpoint.method.toLowerCase());
    const generated: GeneratedType[] = [];

    // ── Path parameters ───────────────────────────────────────────────────────
    if (parts.includes("pathParams") && endpoint.pathParameters.length > 0) {
        const name = `${method}${baseName}PathParams`;
        const code = buildParamsDeclaration(
            name,
            endpoint.pathParameters,
            `Path parameters for ${endpoint.method} ${endpoint.path}`,
            style,
        );
        if (code) generated.push({ part: "pathParams", name, code });
    }

    // ── Query parameters ──────────────────────────────────────────────────────
    if (parts.includes("queryParams") && endpoint.queryParameters.length > 0) {
        const name = `${method}${baseName}QueryParams`;
        const code = buildParamsDeclaration(
            name,
            endpoint.queryParameters,
            `Query parameters for ${endpoint.method} ${endpoint.path}`,
            style,
        );
        if (code) generated.push({ part: "queryParams", name, code });
    }

    // ── Request body ──────────────────────────────────────────────────────────
    if (parts.includes("requestBody") && endpoint.requestBody) {
        const name = `${method}${baseName}RequestBody`;
        const tsType = schemaToTsType(endpoint.requestBody.schema);
        const code = buildDeclaration(
            name,
            tsType,
            style,
            `Request body for ${endpoint.method} ${endpoint.path}`,
        );
        generated.push({ part: "requestBody", name, code });
    }

    // ── Response body ─────────────────────────────────────────────────────────
    if (parts.includes("responseBody")) {
        const filteredResponses = responseCodes
            ? endpoint.responses.filter((r) => responseCodes.includes(r.statusCode))
            : endpoint.responses;

        for (const response of filteredResponses) {
            if (!response.schema) continue;

            const name = `${method}${baseName}Response${response.statusCode}`;
            const tsType = schemaToTsType(response.schema);
            const code = buildDeclaration(
                name,
                tsType,
                style,
                `Response ${response.statusCode} for ${endpoint.method} ${endpoint.path}${response.description ? ` — ${response.description}` : ""}`,
            );
            generated.push({ part: `responseBody_${response.statusCode}`, name, code });
        }
    }

    const fullOutput = generated.map((g) => g.code).join("\n");

    return { types: generated, fullOutput };
}
