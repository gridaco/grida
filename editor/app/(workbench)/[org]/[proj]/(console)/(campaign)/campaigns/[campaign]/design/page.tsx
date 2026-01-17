"use client";

import { Spinner } from "@/components/ui/spinner";
import { useCampaign } from "../store";
import {
  useWWWLayout,
  useWWWTemplate,
  WWWLayoutProvider,
} from "@/scaffolds/platform/www";
import { EnterpriseWestReferralDuo001Editor } from "./_enterprise/west-referral-duo-001-editor";
import type { TemplateData } from "@/theme/templates/enterprise/west-referral/templates";

export default function CampaignLayoutDesignerPage() {
  const { layout_id } = useCampaign();

  if (!layout_id) {
    return <div>This campaign does not have a layout.</div>;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <WWWLayoutProvider id={layout_id}>
        <DesignerRouter />
      </WWWLayoutProvider>
    </div>
  );
}

function DesignerRouter() {
  const { template_id } = useWWWLayout();

  // NOTE: `template_id` here is the DB `template.id` (UUID), not the template key.
  const template = useWWWTemplate<TemplateData.West_Referrral__Duo_001>(
    template_id ?? ""
  );

  // TODO: make this dynamic.
  // This page is currently statically wired to a specific enterprise template editor.
  // In the future, we should dispatch based on `template.data.template_id` (or template metadata)
  // to support multiple templates without adding more enterprise code here.

  if (!template_id) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm text-muted-foreground">
          No template selected.
        </span>
      </div>
    );
  }

  if (template.loading || !template.data) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (template.data.template_id.startsWith("grida_west_referral.duo-000")) {
    return <EnterpriseWestReferralDuo001Editor template={template} />;
  }

  return (
    <div className="h-full flex items-center justify-center">
      <span className="text-sm text-muted-foreground">
        Unsupported template: <code>{template.data.template_id}</code>
      </span>
    </div>
  );
}
