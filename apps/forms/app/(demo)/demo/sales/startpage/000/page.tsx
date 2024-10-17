import FormStartPage from "@/theme/templates/formstart/default/page";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import dummy from "@/theme/templates/formstart/data/01.dummy.json";

export default function CampaignStartPageDev() {
  return (
    <ScreenWindowRoot>
      <FormStartPage
        // @ts-ignore
        data={dummy}
      />
    </ScreenWindowRoot>
  );
}
