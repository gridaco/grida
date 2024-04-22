import FormCompletePageTemplate_receipt01 from "@/theme/templates/formcomplete/receipt01";

const mock = {
  title: "ACME Form Title",
  local_id: 123,
} as const;

export default function Component({
  searchParams,
}: {
  searchParams: {
    title?: string;
  };
}) {
  const title = searchParams.title || mock.title;
  return (
    <FormCompletePageTemplate_receipt01
      form_title={title}
      response_local_id={mock.local_id}
    />
  );
}
