import React from "react";
import Image from "next/image";
import { ResourceTypeIcon } from "../resource-type-icon";
import type { ConnectionSupabaseJoint, Form, GDocument } from "@/types";

export function GridCard({
  title,
  responses,
  thumbnail,
  max_responses,
  has_connection_supabase,
}: GDocument & { thumbnail?: string }) {
  return (
    <div className="rounded border border-neutral-500/10 bg-white dark:bg-neutral-900 shadow-md">
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
            type={has_connection_supabase ? "form-x-supabase" : "form"}
            className="w-10 h-10"
          />
        </div>
      )}
      <div className="px-4 py-2 flex flex-col gap-2">
        <span>{title}</span>
        <span className="text-xs opacity-50">
          {max_responses ? (
            <>
              {responses} / {max_responses} responses
            </>
          ) : (
            <>{responses} responses</>
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
  has_connection_supabase,
}: GDocument & { thumbnail?: string }) {
  return (
    <div className="flex items-center border rounded-md overflow-hidden h-16 shadow bg-white dark:bg-neutral-900">
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
          <ResourceTypeIcon
            type={has_connection_supabase ? "form-x-supabase" : "form"}
            className="w-5 h-5"
          />
        </div>
      )}
      <div className="flex-1 px-6 font-medium text-gray-900 whitespace-nowrap dark:text-white">
        <div className="flex flex-col">
          <span>{title}</span>
          <span className="text-xs font-normal opacity-50">
            Created: {new Date(created_at).toLocaleDateString()}
          </span>
        </div>
      </div>
      <div className="opacity-80 w-32 text-sm">
        {max_responses ? (
          <>
            {responses} / {max_responses}
          </>
        ) : (
          <>{responses}</>
        )}
      </div>
      <div className="opacity-80 w-44 text-sm">
        {new Date(updated_at).toLocaleDateString()}
      </div>
    </div>
  );
}
