export type OpenApiSpec = Record<string, unknown> & {
    openapi?: string;
    swagger?: string;
    info?: { title?: string; version?: string };
};

export function isOpenApiSpec(data: unknown): data is OpenApiSpec {
    return (
        typeof data === "object" &&
        data !== null &&
        ("openapi" in data || "swagger" in data)
    );
}
