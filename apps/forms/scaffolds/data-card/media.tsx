import React, { useCallback } from "react";
import type {
  CellIdentifier,
  DataGridCellFileRefsResolver,
  DataGridFileRef,
  DGResponseRow,
} from "../grid";
import type { FormFieldDefinition } from "@/types";
import { useFileRefs } from "../grid/providers";
import { FileRefsStateRenderer } from "../grid/cells";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaViewer } from "@/components/mediaviewer";
import { Button } from "@/components/ui/button";
import { PlayFilledIcon } from "@/components/icons";
import { FileTypeIcon } from "@/components/form-field-type-icon";

type TRowData = Pick<DGResponseRow, "__gf_id" | "raw" | "fields">;

export function MediaRenderer({
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

  const refs = useFileRefs(identifier, data.raw, resolver);

  const FileContent = useCallback((f: DataGridFileRef) => {
    switch (field.type) {
      case "audio":
      case "video":
        return <MediaAVContent file={f} type={field.type} />;
      case "image":
        return <MediaImageContent file={f} />;
      default:
        throw new Error(`invalid card media type "${field.type}"`);
    }
  }, []);

  return (
    <FileRefsStateRenderer
      refs={refs}
      renderers={{
        loading: <Skeleton className="w-full h-full" />,
        error: "ERR",
        files: FileContent,
      }}
    />
  );
}

function MediaImageContent({ file }: { file: DataGridFileRef }) {
  return (
    <figure className="w-full h-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={file.srcset.thumbnail}
        alt={file.name}
        className="w-full h-full overflow-hidden object-cover bg-secondary/50"
        loading="lazy"
      />
    </figure>
  );
}

function MediaAVContent({
  file,
  type,
}: {
  file: DataGridFileRef;
  type: "audio" | "video";
}) {
  const { openInPictureInPicture } = useMediaViewer();

  return (
    <span className="group">
      <div className="relative inline-flex w-5 h-5 me-1 align-middle">
        <div className="visible group-hover:invisible">
          <FileTypeIcon type={type} className="w-4 h-4" />
        </div>
        <div className="absolute inset-0 rounded hidden group-hover:flex items-center">
          <Button
            variant="default"
            size="icon"
            className="w-5 h-5 p-0.5 rounded-sm"
            onClick={() => {
              openInPictureInPicture(
                {
                  title: file.name,
                  src: file.srcset.original,
                },
                {
                  contentType: `${type}/*`,
                }
              );
            }}
          >
            <PlayFilledIcon className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {/* <span>{file.name}</span> */}
    </span>
  );
}
