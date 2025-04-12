"use client";
import React, { useEffect, useMemo } from "react";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import useSWR from "swr";
import { Platform } from "@/lib/platform";
import { notFound } from "next/navigation";
import ReferrerPage from "./_invite";
import InvitationPage from "./_join";
import { Skeleton } from "@/components/ui/skeleton";
import { useCampaignAgent } from "../../store";

type Params = {
  code: string;
  slug: string;
};

export default function RoutingPage({ params }: { params: Params }) {
  const { code, slug } = params;
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
    const client = new Platform.WEST.Referral.WestReferralClient(campaign.id);
    client.track(code, "page_view");
  }, [code, campaign.id]);

  console.log("campaign.id", campaign.id);

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
          <ReferrerPage slug={slug} data={data.data} />
        </ScreenWindowRoot>
      );
    case "invitation":
      return (
        <ScreenWindowRoot>
          <InvitationPage data={data.data} />
        </ScreenWindowRoot>
      );

    //
  }

  return notFound();
}
