"use client";

import { SiteGeneralSection, type SiteGeneral } from "./section-general";
import { SocialPreviewSection } from "./section-social-preview";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createBrowserWWWClient } from "@/lib/supabase/client";
import { useProject } from "@/scaffolds/workspace";
import { useCallback, useMemo } from "react";
import useSWR, { mutate } from "swr";
import { Spinner } from "@/components/spinner";
import { useForm } from "react-hook-form";
import { Skeleton } from "@/components/ui/skeleton";
import { FaviconEditor } from "@/scaffolds/www-theme-config/components/favicon";
import { SiteDomainsSection } from "./section-domain";

type ProjectWWW = {
  id: string;
  name: string;
  project_id: number;
  title: string | null;
  description: string | null;
  og_image: string | null;
  favicon: {
    src: string;
    srcDark?: string | undefined;
  } | null;
};

function useSiteSettings() {
  const project = useProject();
  const client = useMemo(() => createBrowserWWWClient(), []);

  const __key = "site";

  const { data, isLoading, error } = useSWR<ProjectWWW>(__key, async () => {
    const { data } = await client
      .from("www")
      .select()
      .eq("project_id", project.id)
      .single()
      .throwOnError();

    return data satisfies ProjectWWW;
  });

  const update = useCallback(
    async (payload: Partial<ProjectWWW>) => {
      const task = await client
        .from("www")
        .update(payload)
        .eq("project_id", project.id);

      mutate(__key);

      return task;
    },
    [project.id, client]
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

      mutate(__key);
      return true;
    },
    [client, data]
  );

  const updateFavicon = useCallback(
    async (file: File, name: "src" | "srcDark") => {
      if (!data) return false;

      const t = Date.now();
      const isdark = name === "srcDark";
      const path = isdark
        ? `${data.id}/icons/favicon-dark-${t}.ico`
        : `${data.id}/icons/favicon-${t}.ico`;

      const { data: uploaded, error: upload_err } = await client.storage
        .from("www")
        .upload(path, file, {
          upsert: true,
        });
      if (upload_err) return false;
      const { error } = await update({
        favicon: {
          ...{
            ...(data.favicon || {}),
            // src is always required.
            src: data.favicon?.src ?? uploaded.path,
            [name]: uploaded.path,
          },
        },
      });
      if (error) return false;
      return true;
    },
    [data, update, client]
  );

  const updateOgImage = useCallback(
    async (file: File) => {
      if (!data) return false;
      const t = Date.now();
      const path = `${data.id}/images/og-image-${t}`;

      const { data: uploaded, error: upload_err } = await client.storage
        .from("www")
        .upload(path, file, {
          upsert: true,
        });
      if (upload_err) return false;
      const { error } = await update({
        og_image: uploaded.path,
      });
      if (error) return false;
      return true;
    },
    [update, data, client]
  );

  const getPublicUrl = useCallback(
    (path: string) => {
      return client.storage.from("www").getPublicUrl(path).data.publicUrl;
    },
    [client]
  );

  return {
    data,
    isLoading,
    error,
    update,
    updateFavicon,
    updateOgImage,
    checkDomainName,
    changeDomainName,
    getPublicUrl,
  };
}

export default function ProjectWWWSettingsPage() {
  const {
    data,
    isLoading,
    update,
    updateFavicon,
    updateOgImage,
    checkDomainName,
    changeDomainName,
    getPublicUrl,
  } = useSiteSettings();

  if (isLoading || !data) {
    return (
      <div className="container my-20 max-w-screen-md space-y-20">
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[200px]" />
          </CardHeader>
          <CardContent className="space-y-6">
            <Skeleton className="h-6 w-[200px]" />
            <Skeleton className="h-6 w-[200px]" />
            <Skeleton className="h-6 w-[200px]" />
            <Skeleton className="h-6 w-[200px]" />
            <Skeleton className="h-6 w-[200px]" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container my-20 max-w-screen-md space-y-20">
      <FormSiteGeneral
        url={`${data.name}.grida.site`}
        defaultValues={{
          title: data.title,
          description: data.description,
        }}
        update={update}
      />

      <FormSiteDomain
        defaultValues={{
          name: data.name,
        }}
        changeDomainName={changeDomainName}
        checkDomainName={checkDomainName}
      />

      <Card>
        <CardHeader>
          <CardTitle>Site Images</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <FaviconEditor
            favicon={data.favicon}
            onFileUpload={(file, variant) => {
              return updateFavicon(file, variant);
            }}
            getPublicUrl={getPublicUrl}
          />
          <SocialPreviewSection
            ogImage={data.og_image}
            onFileUpload={updateOgImage}
            getPublicUrl={getPublicUrl}
          />
        </CardContent>
      </Card>
      {/* <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <ThemeLogoSection />
        </CardContent>
      </Card> */}
    </div>
  );
}

function FormSiteGeneral({
  url,
  defaultValues,
  update,
}: {
  url: string;
  defaultValues: SiteGeneral;
  update: (payload: SiteGeneral) => Promise<any>;
}) {
  const form = useForm<SiteGeneral>({
    defaultValues,
  });

  const onSubmit = form.handleSubmit(async (values) => {
    return await update(values);
  });

  const { isSubmitting, isDirty } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Site Settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <SiteGeneralSection
          url={url}
          disabled={isSubmitting}
          value={form.watch()}
          onValueChange={({ title, description }) => {
            form.setValue("title", title, { shouldDirty: true });
            form.setValue("description", description, { shouldDirty: true });
          }}
        />
      </CardContent>
      <CardFooter className="flex justify-end gap-4">
        <Button onClick={onSubmit} disabled={!isDirty || isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner className="ms-2" />
              Saving...
            </>
          ) : (
            <>Save</>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}

function FormSiteDomain({
  defaultValues,
  changeDomainName,
  checkDomainName,
}: {
  checkDomainName: (name: string) => Promise<boolean>;
  changeDomainName: (name: string) => Promise<boolean>;
  defaultValues: {
    name: string;
  };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Domains</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <SiteDomainsSection
          onDomainNameChange={async (name) => {
            const available = await checkDomainName(name);
            if (!available) return false;
            return await changeDomainName(name);
          }}
          name={defaultValues.name}
        />
      </CardContent>
    </Card>
  );
}
