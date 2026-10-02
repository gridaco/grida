import Handlebars from "handlebars";
import { v4 as uuid } from "uuid";
import type { TemplateVariables } from ".";

function createGridaHandlebars(
  features: {
    uuid?: boolean;
  } = { uuid: true }
) {
  const GridaHandlebars = Handlebars.create();

  if (features.uuid) {
    GridaHandlebars.registerHelper("uuid", function () {
      return uuid();
    });
  }

  return GridaHandlebars;
}

export function render(
  source: string,
  context: TemplateVariables.Context,
  options?: CompileOptions
) {
  const GridaHandlebars = createGridaHandlebars();
  return GridaHandlebars.compile(source, options)(context);
}
