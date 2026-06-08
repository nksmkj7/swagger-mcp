// ─── HTTP ─────────────────────────────────────────────────────────────────────

export enum HttpMethod {
    GET = "GET",
    POST = "POST",
    PUT = "PUT",
    DELETE = "DELETE",
    PATCH = "PATCH",
    OPTIONS = "OPTIONS",
    HEAD = "HEAD",
}

// ─── Flat endpoint (used in grouped listing) ──────────────────────────────────

export interface IEndPoint {
    method: string;
    path: string;
    summary: string;
    description?: string;
    tag: string;
}

export type GroupedEndpoints = Record<string, IEndPoint[]>;

// ─── Full endpoint detail (used in detail lookup & curl generation) ───────────

export type ParameterDetail = {
    name: string;
    in: "path" | "query" | "header" | "cookie";
    required: boolean;
    description?: string;
    schema: Record<string, unknown>;
};

export type RequestBodyDetail = {
    required: boolean;
    contentType: string;
    schema: Record<string, unknown>;
};

export type ResponseDetail = {
    statusCode: string;
    description: string;
    contentType?: string;
    schema?: Record<string, unknown>;
};

export type EndpointDetail = {
    method: string;
    path: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tag?: string;
    pathParameters: ParameterDetail[];
    queryParameters: ParameterDetail[];
    headerParameters: ParameterDetail[];
    requestBody?: RequestBodyDetail;
    responses: ResponseDetail[];
};

export type EndpointLookupResult =
    | { found: true; endpoints: EndpointDetail[] }
    | { found: false; message: string; availablePaths: string[] };
