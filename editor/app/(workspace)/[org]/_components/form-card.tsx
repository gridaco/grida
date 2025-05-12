import React from "react";
import Image from "next/image";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { Badge } from "@/components/ui/badge";
import { Labels } from "@/k/labels";
import { LockOpen1Icon } from "@radix-ui/react-icons";
import type { GDocument, GDocumentType } from "@/types";

export function GridCard({
  title,
  responses,
  thumbnail,
  max_responses,
  has_connection_supabase,
  is_public,
  doctype,
}: GDocument & { thumbnail?: string }) {
  return (
    <div className="group rounded-sm border bg-background shadow-md h-full">
      {thumbnail ? (
        <Image
          className="object-cover w-full h-full"
          width={240}
          height={300}
          src={thumbnail}
          alt="thumbnail"
        />
      ) : (
        <div className="p-2 aspect-square w-full flex items-center justify-center border-b">
          <ResourceTypeIcon
            type={doctype}
            className="size-10 text-muted-foreground group-hover:text-foreground transition-colors"
          />
        </div>
      )}
      <div className="px-4 py-2 flex flex-col gap-2">
        <span>{title}</span>
        <div className="flex flex-wrap gap-1">
          <Badges
            doctype={doctype}
            has_connection_supabase={has_connection_supabase}
            is_public={is_public}
          />
        </div>
        <span className="text-xs opacity-50">
          {doctype === "v0_form" ? (
            <>
              {max_responses ? (
                <>
                  {responses} / {max_responses} responses
                </>
              ) : (
                <>{responses} responses</>
              )}
            </>
          ) : (
            <>--</>
          )}
        </span>
      </div>
    </div>
  );
}

export function RowCard({
  title,
  thumbnail,
  responses,
  max_responses,
  created_at,
  updated_at,
  doctype,
  has_connection_supabase,
  is_public,
}: GDocument & { thumbnail?: string }) {
  return (
    <div className="flex items-center border rounded-md overflow-hidden h-16 shadow bg-background">
      {thumbnail ? (
        <Image
          className="object-cover max-w-16 bg-neutral-500 aspect-square"
          width={440}
          height={440}
          src={thumbnail}
          alt="thumbnail"
        />
      ) : (
        <div className="p-2 aspect-square h-full flex items-center justify-center border-r">
          <ResourceTypeIcon type={doctype} className="size-5" />
        </div>
      )}
      <div className="flex-1 px-6 font-medium whitespace-nowrap">
        <div className="flex flex-col">
          <span className="flex gap-2">
            <span>{title}</span>
            <Badges
              doctype={doctype}
              has_connection_supabase={has_connection_supabase}
              is_public={is_public}
            />
          </span>
          <span className="flex gap-2">
            <span className="text-xs font-normal opacity-50">
              Created: {new Date(created_at).toLocaleDateString()}
            </span>
          </span>
        </div>
      </div>
      <div className="opacity-80 w-32 text-sm">
        {doctype === "v0_form" ? (
          <>
            {max_responses ? (
              <>
                {responses} / {max_responses}
              </>
            ) : (
              <>{responses}</>
            )}
          </>
        ) : (
          <>--</>
        )}
      </div>
      <div className="opacity-80 w-44 text-sm">
        {new Date(updated_at).toLocaleDateString()}
      </div>
    </div>
  );
}

function Badges({
  doctype,
  has_connection_supabase,
  is_public,
}: {
  doctype: GDocumentType;
  has_connection_supabase: boolean;
  is_public: boolean;
}) {
  return (
    <>
      <Badge
        variant="outline"
        className="text-xs text-muted-foreground font-normal font-mono px-1.5"
      >
        {Labels.doctype(doctype)}
      </Badge>
      {has_connection_supabase && (
        <Badge variant="outline" className="p-1">
          <ResourceTypeIcon type="form-x-supabase" className="size-4" />
        </Badge>
      )}
      {is_public && (
        <Badge
          variant="outline"
          className="text-xs text-muted-foreground font-normal font-mono px-1.5"
        >
          <LockOpen1Icon className="me-1 size-3" />
          Public
        </Badge>
      )}
    </>
  );
}
