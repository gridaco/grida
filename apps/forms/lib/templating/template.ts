import Handlebars from "handlebars";
import type { TemplateVariables } from ".";

export function template(
  source: string,
  context: TemplateVariables.FormResponseContext
) {
  return Handlebars.compile(source)(context);
}
