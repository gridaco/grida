import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { supported_field_types } from "@/k/supported_field_types";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const type_form_field_type = `export type FormFieldType = | ${supported_field_types.map((type) => `"${type}"`).join(" | ")};`;

const interface_txt = `
\`\`\`
export type FormField = {
  name: string; // The input's name, identifier. Recommended to use lowercase and use an underscore to separate words e.g. column_name
  label: string; // Human readable label
  type: FormFieldType; // Type of field
  placeholder: string; // Placeholder text
  required: boolean; // Whether the field is required
  help_text: string; // Help text, displayed below the field
  pattern?: string; // Regular expression pattern for validation (for html input pattern attribute)
  options?: { label: string; value: string }[]; // Options for [select, radio]
};

${type_form_field_type}
\`\`\`
`;

export async function POST(req: NextRequest) {
  const requestBody = await req.json();
  const description = requestBody.description;

  if (!description) {
    return new NextResponse(
      JSON.stringify({ error: "Description is required" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }

  const prompt = `Based on the user's field description: "${description}", create a form field schema with the \`FormField\` interface. The json should be acceptable by the following interface with JSON.parse()
${interface_txt}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Create a JSON schema for a form field based on a description, ensuring the type matches specific options. Users might not speak english, so be sure to localize the response based on their input.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      response_format: {
        type: "json_object",
      },
      temperature: 0.5,
      max_tokens: 1024,
      stop: null,
    });

    const content = response.choices[0].message.content!;
    console.log("ai", content);
    let schema = JSON.parse(content);
    console.log("ai", schema);

    // Validate the type field
    if (!supported_field_types.includes(schema.type)) {
      // if the response is not a valid form field type, fallback to text
      schema.type = "text";
    }

    // Additional validation and adjustment logic here if necessary

    return new NextResponse(JSON.stringify(schema), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    console.error(error);
    return new NextResponse(
      JSON.stringify({
        error: error.message || "Failed to generate form field schema",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
}
