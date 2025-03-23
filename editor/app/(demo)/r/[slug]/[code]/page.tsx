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

interface TokenPublicData {
  host: {
    name: string;
  };
}

export default function RoutingPage({ params }: { params: Params }) {
  const client = useMemo(
    () => new Platform.WEST.WestClient<TokenPublicData>(params.slug),
    [params.slug]
  );

  const { code, slug } = params;

  const { data, isLoading } = useSWR<{
    data: Platform.WEST.Token<TokenPublicData>;
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
    client.track(code, "view");
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

  switch (data.data.token_type) {
    case "mintable":
      return (
        <ScreenWindowRoot>
          <Invite token={data.data} />
        </ScreenWindowRoot>
      );
    case "redeemable":
      return (
        <ScreenWindowRoot>
          <Join token={data.data} />
        </ScreenWindowRoot>
      );

    //
  }

  return notFound();
}
