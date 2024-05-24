import { TemplateVariables } from "@/lib/templating";
import FormCompletePageTemplate_receipt01 from "@/theme/templates/formcomplete/receipt01";
import FormCompletePageDefault from "@/theme/templates/formcomplete/default";

export function EndingPageWithContext({
  template,
  context,
}: {
  template: string | null;
  context: TemplateVariables.FormResponseContext;
}) {
  switch (template) {
    case "receipt01":
      return <FormCompletePageTemplate_receipt01 {...context} />;
    case "default":
    case undefined:
    case null:
    default:
      return <FormCompletePageDefault {...context} />;
  }
}
