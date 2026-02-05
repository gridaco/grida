import { render } from "@/lib/templating/template";
import { fmt_local_index } from "@/utils/fmt";

export function toStringValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function stringifyFields(raw: Record<string, unknown>) {
  return Object.keys(raw).reduce(
    (acc, key) => {
      acc[key] = toStringValue(raw[key]);
      return acc;
    },
    {} as Record<string, string>
  );
}

export function renderRespondentEmail({
  form_title,
  raw,
  response_local_index,
  response_local_id,
  subject_template,
  body_html_template,
}: {
  form_title: string;
  raw: Record<string, unknown>;
  response_local_index: number;
  response_local_id: string | null;
  subject_template: string | null;
  body_html_template: string;
}) {
  const fields = stringifyFields(raw);

  const contextVars = {
    form_title,
    fields,
    response: {
      short_id: response_local_id ?? null,
      index: response_local_index,
      idx: fmt_local_index(response_local_index),
    },
  };

  const subjectSource =
    subject_template?.trim() || `Thanks for your submission: {{form_title}}`;
  const htmlSource = body_html_template.trim();

  return {
    subject: render(subjectSource, contextVars as any),
    html: render(htmlSource, contextVars as any),
    context: contextVars,
  };
}
