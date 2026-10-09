import NewOrganizationForm from "./form";
export default function NewOrganizationSetupPage(props: {
  searchParams: Promise<{ error?: string }>;
}) {
  return <NewOrganizationForm searchParams={props.searchParams} />;
}
