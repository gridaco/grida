"use client";
import React, { useEffect, useMemo, use } from "react";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import useSWR from "swr";
import { Platform } from "@/lib/platform";
import { notFound } from "next/navigation";
import ReferrerPage from "./_components/referrer";
import InvitationPage from "./_components/invitation";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaignAgent } from "../../store";
import { useLayout } from "@/scaffolds/tenant";
import { TemplateData } from "@/theme/templates/west-referral/templates";

type Params = {
  code: string;
  slug: string;
};

export default function LayoutPage(props: { params: Promise<Params> }) {
  const params = use(props.params);
  const { code } = params;
  const { template } = useLayout();
  const campaign = useCampaignAgent();
  const client = useMemo(
    () => new Platform.WEST.Referral.WestReferralClient(campaign.id),
    [campaign.id]
  );

  const { data, isLoading, error } = useSWR<{
    data:
      | Platform.WEST.Referral.ReferrerPublicRead
      | Platform.WEST.Referral.InvitationPublicRead;
  }>(
    code,
    async (code) => {
      return client.read(code);
    },
    {
      revalidateOnFocus: true,
      refreshInterval: 1000 * 30,
    }
  );

  useEffect(() => {
    client.track(code, "page_view");
  }, [code, client]);

  if (error) {
    console.error("error", error);
    return notFound();
  }

  if (isLoading || !data) {
    return (
      <ScreenWindowRoot>
        <div className="w-full h-full p-4">
          <Skeleton className="w-full h-full" />
        </div>
      </ScreenWindowRoot>
    );
  }

  const { type } = data.data;

  switch (type) {
    case "referrer":
      return (
        <ScreenWindowRoot>
          <ReferrerPage
            context={data.data}
            client={client}
            template={template.data as TemplateData.West_Referrral__Duo_001}
          />
        </ScreenWindowRoot>
      );
    case "invitation":
      return (
        <ScreenWindowRoot>
          <InvitationPage
            context={data.data}
            client={client}
            template={template.data as TemplateData.West_Referrral__Duo_001}
          />
        </ScreenWindowRoot>
      );

    //
  }

  return notFound();
}
