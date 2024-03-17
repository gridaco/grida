import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the available form field types
const formFieldTypes = [
  "text",
  "textarea",
  "tel",
  "url",
  "checkbox",
  "number",
  "date",
  "month",
  "week",
  "email",
  "file",
  "image",
  "select",
  "latlng",
  "password",
  "color",
  "radio",
  "country",
  "payment",
];

const interface_txt = `
\`\`\`
export type NewFormFieldInit = {
  name: string; // The input's name, identifier. Recommended to use lowercase and use an underscore to separate words e.g. column_name
  label: string; // Human readable label
  placeholder: string; // Placeholder text
  helpText: string; // Help text, displayed below the field
  type: FormFieldType; // Type of field
  required: boolean; // Whether the field is required
  options?: { label: string; value: string }[]; // Options for [select, radio]
  pattern?: string; // Regular expression pattern for validation (for html input pattern attribute)
};

export type FormFieldType = | "text" | "textarea" | "tel" | "url" | "checkbox" | "number" | "date" | "month" | "week" | "email" | "file" | "image" | "select" | "latlng" | "password" | "color" | "radio" | "country" | "payment";
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

  const prompt = `Based on the user's field description: "${description}", create a form field schema with the \`NewFormFieldInit\` interface. The json should be acceptable by the following interface with JSON.parse()
${interface_txt}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-1106-preview",
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
    console.log(content);
    let schema = JSON.parse(content);
    console.log(schema);

    // Validate the type field
    if (!formFieldTypes.includes(schema.type)) {
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
