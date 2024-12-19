import _006 from "@/theme/templates/formstart/006/page";
import _messages from "@/theme/templates/formstart/006/messages.json";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";

const dummy = {
  meta: {
    max_form_responses_by_customer: 100,
    is_max_form_responses_by_customer_enabled: true,
    max_form_responses_in_total: 100,
    is_max_form_responses_in_total_enabled: true,
    is_force_closed: false,
    is_scheduling_enabled: true,
    scheduling_open_at: "2024-10-17T00:00:00Z",
    scheduling_close_at: "2024-12-18T00:00:00Z",
  },
};

export default function Page() {
  return (
    <ScreenWindowRoot>
      <_006 />
    </ScreenWindowRoot>
  );
}
