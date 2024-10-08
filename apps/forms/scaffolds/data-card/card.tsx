import React, { useMemo } from "react";
import * as CardPrimitives from "@/components/ui/card";
import {
  CellIdentifier,
  DataGridCellFileRefsResolver,
  DGColumn,
  DGResponseRow,
} from "../grid";
import type { FormFieldDefinition } from "@/types";
import { useFileRefs } from "../grid/providers";
import { FileRefsStateRenderer } from "../grid/cells";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { Data } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { LineContent } from "./line";

type TRowData = Pick<DGResponseRow, "__gf_id" | "raw" | "fields">;

export function DataCard({
  media_fields,
  primary_media_name,
  properties,
  data,
}: {
  media_fields?: FormFieldDefinition[];
  primary_media_name: string | null;
  properties: (Data.Relation.Attribute & { label: string })[];
  data: TRowData;
}) {
  const primary_media_field = media_fields?.find(
    (c) => c.name === primary_media_name
  );

  const primary_media = primary_media_field
    ? data.fields[primary_media_field.id]
    : null;

  const lines = useMemo(() => {
    return properties
      .filter((p) => {
        // if value is empty, don't show
        const value = data.raw![p.name];
        if (value === null || value === undefined) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        if (typeof value === "string" && value.trim() === "") return false;

        return true;
      })
      .map((prop) => {
        const value = data.raw![prop.name];

        return (
          <Tooltip key={prop.name} delayDuration={100}>
            <TooltipTrigger className="w-full text-start overflow-hidden text-ellipsis">
              <LineContent value={value} property={prop} wrap />
            </TooltipTrigger>
            <TooltipContent side="left" align="center">
              {prop.label}
            </TooltipContent>
          </Tooltip>
        );
      });
  }, [data, properties]);

  return (
    <ModelCard
      media={
        primary_media?.files ? (
          <CardMediaSection
            data={data}
            field={primary_media_field!}
            resolver={primary_media.files}
          />
        ) : undefined
      }
      lines={lines}
    />
  );
}

function CardMediaSection({
  data,
  field,
  resolver,
}: {
  data: TRowData;
  field: FormFieldDefinition;
  resolver?: DataGridCellFileRefsResolver;
}) {
  const identifier: CellIdentifier = {
    attribute: field.id,
    key: data.__gf_id,
  };

  switch (field.type) {
    case "audio":
    case "video":
    case "image":
      return (
        <CardMediaImageContent
          identifier={identifier}
          rowdata={data.raw}
          resolver={resolver}
        />
      );
    default:
      throw new Error(`invalid card media type "${field.type}"`);
  }
}

function CardMediaImageContent({
  identifier,
  rowdata,
  resolver,
}: {
  identifier: CellIdentifier;
  rowdata: Record<string, any> | null;
  resolver?: DataGridCellFileRefsResolver;
}) {
  const refs = useFileRefs(identifier, rowdata, resolver);

  return (
    <>
      <FileRefsStateRenderer
        refs={refs}
        renderers={{
          loading: <Skeleton className="w-full h-full" />,
          error: "ERR",
          files: (f, i) => {
            return (
              <figure key={i} className="w-full h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f.srcset.thumbnail}
                  alt={f.name}
                  className="w-full h-full overflow-hidden object-cover"
                  loading="lazy"
                />
              </figure>
            );
          },
        }}
      />
    </>
  );
}

function ModelCard({
  media,
  title,
  paragraph,
  lines,
}: {
  media?: React.ReactNode;
  title?: string | React.ReactNode;
  subtitle?: string | React.ReactNode;
  paragraph?: string | React.ReactNode;
  lines?: Array<string | React.ReactNode>;
}) {
  return (
    <CardPrimitives.Card className="overflow-hidden rounded-md">
      <CardMediaRoot className="border-b">
        <>{media ? media : <></>}</>
      </CardMediaRoot>
      <CardPrimitives.CardContent className="pt-4 px-2">
        {title}
        <CardPropertyLines>
          {lines?.map((l, i) => {
            return <CardPropertyLine key={i}>{l}</CardPropertyLine>;
          })}
        </CardPropertyLines>
      </CardPrimitives.CardContent>
    </CardPrimitives.Card>
  );
}

function CardMediaRoot({
  className,
  children,
}: React.PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={cn(
        "w-full aspect-video overflow-hidden bg-neutral-100 dark:bg-neutral-900",
        className
      )}
    >
      {children}
    </div>
  );
}

function CardPropertyLines({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex flex-col w-full gap-2">{children}</div>;
}

function CardPropertyLine({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex">{children}</div>;
}
