import { TemplateVariables } from "@/lib/templating";
import FormCompletePageTemplate_receipt01 from "@/theme/templates/formcomplete/receipt01";
import FormCompletePageDefault from "@/theme/templates/formcomplete/default";
import { EndingPageI18nOverrides } from "@/types";

export function EndingPageWithContext({
  template_id,
  overrides,
  context,
}: {
  template_id: string | null;
  overrides: EndingPageI18nOverrides | null;
  context: TemplateVariables.FormResponseContext;
}) {
  const has_override = overrides?.template_id === template_id;
  switch (template_id) {
    case "receipt01":
      return (
        <FormCompletePageTemplate_receipt01
          overrides={has_override ? overrides?.overrides : undefined}
          context={context}
        />
      );
    case "default":
    case undefined:
    case null:
    default:
      return (
        <FormCompletePageDefault
          overrides={has_override ? overrides?.overrides : undefined}
          context={context}
        />
      );
  }
}
