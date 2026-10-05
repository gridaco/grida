import OrganizationProfile from "./view";
export default function OrganizationsSettingsProfilePage(props: {
  params: Promise<{ organization_name: string }>;
}) {
  return <OrganizationProfile params={props.params} />;
}
