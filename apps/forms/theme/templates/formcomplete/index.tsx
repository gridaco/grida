import { TemplateVariables } from "@/lib/templating";
import FormCompletePageTemplate_receipt01 from "./receipt01";
import FormCompletePageDefault from "@/theme/templates/formcomplete/default";

export function EndingPage({
  template_id,
  data,
}: {
  template_id: string | null;
  data: TemplateVariables.FormResponseContext;
}) {
  switch (template_id) {
    case "receipt01":
      return <FormCompletePageTemplate_receipt01 {...data} />;
    case "default":
    case undefined:
    case null:
    default:
      return <FormCompletePageDefault {...data} />;
  }
}
