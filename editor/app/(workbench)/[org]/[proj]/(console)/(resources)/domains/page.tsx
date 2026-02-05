"use client";

import { CustomDomainsSection } from "./section-domains";
import { createBrowserWWWClient } from "@/lib/supabase/client";
import { useProject } from "@/scaffolds/workspace";
import { useCallback, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_PLATFORM_APEX_DOMAIN,
  platformSiteHostnameForTenant,
} from "@/lib/domains";

type ProjectWWWMinimal = {
  id: string;
  name: string;
  project_id: number;
};

function useDomainsPageData() {
  const project = useProject();
  const client = useMemo(() => createBrowserWWWClient(), []);

  const key = "site-domains";

  const { data, isLoading, error } = useSWR<ProjectWWWMinimal>(
    key,
    async () => {
      const { data } = await client
        .from("www")
        .select("id, name, project_id")
        .eq("project_id", project.id)
        .single()
        .throwOnError();

      return data satisfies ProjectWWWMinimal;
    }
  );

  const checkDomainName = useCallback(
    async (name: string) => {
      const { data: available, error } = await client.rpc(
        "check_www_name_available",
        {
          p_name: name,
        }
      );

      if (error) return false;
      return available;
    },
    [client]
  );

  const changeDomainName = useCallback(
    async (name: string) => {
      if (!data) return false;
      const { error } = await client.rpc("change_www_name", {
        p_www_id: data.id,
        p_name: name,
      });

      if (error) return false;

      // Keep both pages in sync if they're open in tabs.
      mutate(key);
      mutate("site");
      return true;
    },
    [client, data]
  );

  return {
    project,
    data,
    isLoading,
    error,
    checkDomainName,
    changeDomainName,
  };
}

export default function DomainsPage() {
  const { project, data, isLoading, checkDomainName, changeDomainName } =
    useDomainsPageData();

  if (isLoading || !data) {
    return (
      <div className="container my-20 max-w-screen-md space-y-6">
        <Skeleton className="h-6 w-[200px]" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[280px] w-full" />
      </div>
    );
  }

  return (
    <div className="container my-20 max-w-screen-md">
      <CustomDomainsSection
        org={project.organization_name}
        proj={project.name}
        platformName={data.name}
        platformDomain={platformSiteHostnameForTenant(
          data.name,
          DEFAULT_PLATFORM_APEX_DOMAIN
        )}
        onPlatformNameChange={async (name) => {
          const available = await checkDomainName(name);
          if (!available) return false;
          return await changeDomainName(name);
        }}
      />
    </div>
  );
}
