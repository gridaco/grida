import FormCompletePageTemplate_receipt01 from "./receipt01";
import { FormResponsePageTemplateProps } from "./types";

export function EndingPage({
  template_id,
  data,
}: {
  template_id: string;
  data: FormResponsePageTemplateProps;
}) {
  switch (template_id) {
    case "receipt01":
      return <FormCompletePageTemplate_receipt01 {...data} />;
    default:
      return <></>;
  }
}
