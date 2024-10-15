import FormStartPage from "@/theme/templates/formstart/default/page";

import dummy from "@/theme/templates/formstart/data/01.dummy.json";

export default function CampaignStartPageDev() {
  return (
    <FormStartPage
      // @ts-ignore
      data={dummy}
    />
  );
}
