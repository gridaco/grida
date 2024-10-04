import { cn } from "@/utils";
import { GalleryModelCard } from "./modelcard";
import { useSchemaDefinition } from "../data-query";
import assert from "assert";
import {
  CellIdentifier,
  DataGridCellFileRefsResolver,
  DGColumn,
  DGResponseRow,
} from "../grid";
import { Label } from "@/components/ui/label";
import { SupabasePostgRESTOpenApi } from "@/lib/supabase-postgrest";
import { useMemo } from "react";
import { PGSupportedColumnType } from "@/lib/supabase-postgrest/@types/pg";
import { FormInputType } from "@/types";
import { useFileRefs } from "../grid/providers";
import { FileRefsStateRenderer } from "../grid/cells";
import { Skeleton } from "@/components/ui/skeleton";

const media_types: FormInputType[] = ["image", "video", "audio"] as const;

function analyze({
  definition,
  columns,
}: {
  definition: SupabasePostgRESTOpenApi.SupabaseOpenAPIDefinitionJSONSchema;
  columns: DGColumn[];
}) {
  //

  const analyzed =
    SupabasePostgRESTOpenApi.parse_supabase_postgrest_schema_definition(
      definition
    );

  const keys = Object.keys(analyzed.properties);

  const devpropertykeys = keys.filter(
    (key) =>
      ["uuid"].includes(analyzed.properties[key].scalar_format) ||
      !!analyzed.properties[key].fk ||
      analyzed.properties[key].pk
  );

  const normalpropertykeys = keys.filter(
    (key) => devpropertykeys.indexOf(key) === -1
  );

  const virtual_columns = columns.filter((col) => {
    return !keys.includes(col.key);
  });

  const virtual_media_columns = virtual_columns.filter((col) => {
    return col.type && media_types.includes(col.type);
  });

  const prioritiezed_virtual_media_columns = virtual_media_columns.sort(
    (a, b) => {
      switch (a.type) {
        case "video":
          return 2;
        case "audio":
          return 1;
        case "image":
          return 0;
        default:
          return -1;
      }
    }
  );

  const primary_virtual_media_column =
    prioritiezed_virtual_media_columns.length > 0
      ? prioritiezed_virtual_media_columns[0]
      : null;

  return {
    devpropertykeys,
    normalpropertykeys,
    primary_virtual_media_column,
    prioritiezed_virtual_media_columns,
    analyzed,
  };
}

export function Gallery({
  className,
  rows,
  columns,
}: {
  rows: DGResponseRow[];
  columns: DGColumn[];
  className?: string;
}) {
  const definition = useSchemaDefinition();

  assert(definition);

  const {
    normalpropertykeys,
    analyzed,
    prioritiezed_virtual_media_columns,
    primary_virtual_media_column,
  } = useMemo(() => {
    return analyze({ definition, columns });
  }, [definition, columns]);

  return (
    <div
      className={cn(
        "p-4 grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
        className
      )}
    >
      {rows.map((row, i) => {
        return (
          <DynamicDataCard
            key={i}
            data={row}
            primary_media_column_key={primary_virtual_media_column?.key || null}
            media_columns={prioritiezed_virtual_media_columns}
            properties={normalpropertykeys.map((key) => ({
              name: key,
              label: key,
              format: analyzed.properties[key].scalar_format,
            }))}
          />
        );
      })}
    </div>
  );
}

function DynamicDataCard({
  media_columns,
  primary_media_column_key,
  properties,
  data,
}: {
  media_columns: DGColumn[];
  primary_media_column_key: string | null;
  properties: { name: string; label: string; format: PGSupportedColumnType }[];
  data: DGResponseRow;
}) {
  const primary_media_column = media_columns.find(
    (c) => c.key === primary_media_column_key
  );

  const primary_media = primary_media_column
    ? data.fields[primary_media_column.key]
    : null;

  return (
    <GalleryModelCard
      media={
        primary_media?.files ? (
          <CardMediaSection
            data={data}
            column={primary_media_column!}
            resolver={primary_media.files}
          />
        ) : undefined
      }
      lines={properties.map((prop) => {
        const value = data.raw![prop.name];

        return (
          <div key={prop.name} className="flex flex-col w-full">
            {/* <Label>{prop.label}</Label> */}
            <span className="text-sm text-muted-foreground w-full text-ellipsis overflow-hidden whitespace-nowrap">
              {fmtsafely(String(value), prop.format)}
            </span>
          </div>
        );
      })}
    />
  );
}

function CardMediaSection({
  data,
  column,
  resolver,
}: {
  data: DGResponseRow;
  column: DGColumn;
  resolver?: DataGridCellFileRefsResolver;
}) {
  const identifier: CellIdentifier = {
    attribute: column.key,
    key: data.__gf_id,
  };

  switch (column.type) {
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
      throw new Error(`invalid card media type "${column.type}"`);
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

  console.log(refs);

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

function fmtsafely(txt: string, format: PGSupportedColumnType) {
  try {
    switch (format) {
      case "timetz":
      case "timestamptz":
      case "timestamp":
      case "timestamp without time zone":
      case "timestamp with time zone":
      case "date":
      case "time":
      case "time without time zone":
      case "time with time zone":
        return new Date(txt).toLocaleString();
      case "boolean":
        return txt === "true" ? "Yes" : "No";
      case "json":
      case "jsonb":
        return JSON.stringify(txt);
    }

    return txt;
  } catch (e) {
    return "ERR";
  }
}
