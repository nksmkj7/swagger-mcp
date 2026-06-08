import { z } from "zod";
import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolCharacteristics<ArgType, ReturnType> = {
    name: string;
    title?: string;
    description?: string;
    inputSchema?: z.ZodType<ArgType>;
    outputSchema?: z.ZodType<ReturnType>;
    execute: ToolExecutor<ArgType, ReturnType>;
};

export type Tools<ArgType = Record<string, unknown>, ReturnType = unknown> = {
    [index: string]: ToolCharacteristics<ArgType, ReturnType>;
};

export type ToolExecutor<ArgType, ReturnType> = (
    params: ArgType
) => Promise<ReturnType>;

// Prompt arg schemas: each key maps to a ZodString or optional ZodString.
// Matches the SDK's ZodRawShapeCompat constraint for registerPrompt argsSchema.
export type PromptArgsSchema = Record<string, z.ZodString | z.ZodOptional<z.ZodString>>;

export type PromptCharacteristics<
    ArgsSchema extends PromptArgsSchema = PromptArgsSchema
> = {
    name: string;
    description?: string;
    argsSchema?: ArgsSchema;
    execute: (args: {
        [K in keyof ArgsSchema]: z.infer<ArgsSchema[K]>;
    }) => Promise<GetPromptResult>;
};
