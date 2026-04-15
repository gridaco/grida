import { generateObject } from "ai";
import { z } from "zod/v3";
import { NextRequest, NextResponse } from "next/server";
import { supported_field_types } from "@/k/supported_field_types";
import { model } from "@/lib/ai/models";
import type { FormInputType } from "@/grida-forms-hosted/types";

/**
 * Strict-mode-compatible Zod schema for AI structured output.
 *
 * Uses `.nullable()` instead of `.optional()` so every property appears in the
 * JSON Schema `required` array (OpenAI structured output requirement).
 *
 * The `type` enum is built dynamically from `supported_field_types` so it stays
 * in sync with the rest of the codebase.
 */
const formFieldSchema = z.object({
  name: z
    .string()
    .describe(
      "The input's name identifier. Use lowercase with underscores, e.g. column_name"
    ),
  label: z.string().describe("Human-readable label for the field"),
  type: z
    .enum(supported_field_types as [FormInputType, ...FormInputType[]])
    .describe("HTML5 + extended input type"),
  placeholder: z.string().describe("Placeholder text"),
  required: z.boolean().describe("Whether the field is required"),
  help_text: z.string().describe("Help text displayed below the field"),
  pattern: z
    .string()
    .nullable()
    .describe(
      "Regular expression pattern for validation (HTML input pattern attribute)"
    ),
  options: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      })
    )
    .nullable()
    .describe("Options for select / radio fields"),
});

export async function POST(req: NextRequest) {
  const requestBody = await req.json();
  const description = requestBody.description;

  if (!description) {
    return NextResponse.json(
      { error: "Description is required" },
      { status: 400 }
    );
  }

  try {
    const { object: schema } = await generateObject({
      model: model("nano"),
      schema: formFieldSchema,
      system:
        "Generate a form field definition based on the user's description. " +
        "Users might not speak English — localise label, placeholder, and help_text to match their input language.",
      prompt: description,
    });

    return NextResponse.json(schema);
  } catch (error: unknown) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          (error instanceof Error ? error.message : null) ||
          "Failed to generate form field schema",
      },
      { status: 500 }
    );
  }
}
