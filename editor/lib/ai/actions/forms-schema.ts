"use server";

/**
 * Form-field schema generator — AI-assisted authoring for the Grida
 * Forms editor. Given a free-form description, returns a single
 * structured-output `FormFieldInit`.
 *
 * `withAiAuth` is invoked with `{ balance: false }` because the forms
 * editor doesn't display the AI credit chip — skipping the post-fn
 * Metronome read avoids both latency and rate-limit pressure.
 */

import { generateObject } from "ai";
import { z } from "zod/v3";
import { supported_field_types } from "@/k/supported_field_types";
import { model, withAiAuth, type ActionResult } from "@/lib/ai/server";
import type { FormInputType } from "@/grida-forms-hosted/types";

/**
 * Strict-mode-compatible Zod schema for AI structured output.
 *
 * Uses `.nullable()` instead of `.optional()` so every property appears
 * in the JSON Schema `required` array (OpenAI structured output
 * requirement). The `type` enum is built dynamically from
 * `supported_field_types` so it stays in sync with the rest of the
 * codebase.
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

export type GenerateFormFieldSchemaInput = {
  organizationId?: number;
  description: string;
};

export type FormFieldSchemaResult = z.infer<typeof formFieldSchema>;

export type GenerateFormFieldSchemaResponse =
  ActionResult<FormFieldSchemaResult>;

export async function generateFormFieldSchema(
  input: GenerateFormFieldSchemaInput
): Promise<GenerateFormFieldSchemaResponse> {
  if (!input.description || input.description.trim() === "") {
    return {
      success: false,
      code: "bad_request",
      message: "description is required",
      status: 400,
    };
  }
  return withAiAuth(
    "forms/schema/generate",
    input.organizationId,
    async (organizationId) => {
      const { object } = await generateObject({
        model: model("nano"),
        providerOptions: {
          grida: { organizationId, feature: "forms/schema/generate" },
        },
        schema: formFieldSchema,
        system:
          "Generate a form field definition based on the user's description. " +
          "Users might not speak English — localise label, placeholder, and help_text to match their input language.",
        prompt: input.description,
      });
      return object;
    },
    { balance: false }
  );
}
