"use client";
import React, { useEffect, useMemo } from "react";
import { ScreenWindowRoot } from "@/theme/templates/kit/components";
import useSWR from "swr";
import { Platform } from "@/lib/platform";
import { notFound } from "next/navigation";
import Invite from "./_invite";
import Join from "./_join";
import { Skeleton } from "@/components/ui/skeleton";

type Params = {
  code: string;
  slug: string;
};

export default function RoutingPage({ params }: { params: Params }) {
  const client = useMemo(
    () => new Platform.WEST.WestClient(params.slug),
    [params.slug]
  );

  const { code, slug } = params;

  const { data, isLoading } = useSWR<{
    data: Platform.WEST.TokenPublicRead;
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
    //
    const client = new Platform.WEST.WestClient(slug);
    client.track(code, "page_view");
  }, [code, slug]);

  if (isLoading || !data) {
    return (
      <ScreenWindowRoot>
        <div className="w-full h-full p-4">
          <Skeleton className="w-full h-full" />
        </div>
      </ScreenWindowRoot>
    );
  }

  const { token, children } = data.data;

  switch (token.token_type) {
    case "mintable":
      return (
        <ScreenWindowRoot>
          <Invite data={data.data} />
        </ScreenWindowRoot>
      );
    case "redeemable":
      return (
        <ScreenWindowRoot>
          <Join data={data.data} />
        </ScreenWindowRoot>
      );

    //
  }

  return notFound();
}
