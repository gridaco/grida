import FormCompletePageTemplate_receipt01 from "./receipt01";
import { TemplateVariables } from "@/lib/templating";

export function EndingPage({
  template_id,
  data,
}: {
  template_id: string;
  data: TemplateVariables.FormResponseContext;
}) {
  switch (template_id) {
    case "receipt01":
      return <FormCompletePageTemplate_receipt01 {...data} />;
    default:
      return <></>;
  }
}
