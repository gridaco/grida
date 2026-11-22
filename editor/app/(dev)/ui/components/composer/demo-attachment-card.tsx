import { FileIcon, FolderIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type {
  ComposerAttachment,
  ComposerFileAttachment,
} from "@/kits/composer";
import { samplePdfAttachmentId } from "./demo-data";

export function DemoAttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
}) {
  const { name } = attachment;
  return (
    <div className="group/attachment relative min-w-0" title={name}>
      {attachment.kind === "directory" ||
      attachment.mime === "inode/directory" ? (
        <div className="flex h-11 w-48 max-w-full items-center gap-2 rounded-xl border bg-background px-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-sky-500">
            <FolderIcon aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs leading-4 font-medium">{name}</div>
            <div className="truncate text-[10px] leading-3 text-muted-foreground">
              {attachment.kind === "directory"
                ? "Folder · read only"
                : "Folder"}
            </div>
          </div>
        </div>
      ) : (
        <FileCard attachment={attachment} />
      )}
      <button
        aria-label={`Remove ${name}`}
        className="group/remove absolute -top-2.5 -right-2.5 grid size-7 cursor-pointer place-items-center rounded-full opacity-0 focus-visible:outline-none motion-safe:transition-opacity group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100 pointer-coarse:opacity-100"
        onClick={onRemove}
        type="button"
      >
        <span className="grid size-3.5 place-items-center rounded-full bg-foreground text-background shadow-xs ring-1 ring-background group-hover/remove:bg-foreground/85 group-focus-visible/remove:outline-2 group-focus-visible/remove:outline-offset-2 group-focus-visible/remove:outline-ring">
          <XIcon aria-hidden="true" className="size-2" />
        </span>
      </button>
    </div>
  );
}

function FileCard({ attachment }: { attachment: ComposerFileAttachment }) {
  const [failedSource, setFailedSource] = useState<string>();
  const { name, mime, url, poster } = attachment;
  const isImage = mime?.startsWith("image/") && mime !== "image/svg+xml";
  const source = isImage ? url : poster;
  const preview = source && source !== failedSource && (
    <Image
      alt=""
      className="object-cover"
      fill
      sizes="96px"
      src={source}
      unoptimized
      onError={() => setFailedSource(source)}
    />
  );
  const extension = name.includes(".") ? name.split(".").pop() : undefined;

  return (
    <div className="relative flex size-24 flex-col overflow-hidden rounded-xl border bg-muted">
      {isImage && preview ? (
        preview
      ) : (
        <>
          <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden">
            {attachment.id === samplePdfAttachmentId ? (
              <SamplePdfPreview />
            ) : (
              preview || (
                <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
                  <FileIcon
                    aria-hidden="true"
                    className="size-6 stroke-[1.5]"
                  />
                  <span className="max-w-16 truncate text-[9px] font-medium uppercase">
                    {extension || "File"}
                  </span>
                </div>
              )
            )}
          </div>
          <span className="truncate border-t bg-background px-2 py-1.5 text-xs font-medium">
            {name}
          </span>
        </>
      )}
    </div>
  );
}

function SamplePdfPreview() {
  return (
    <div
      aria-hidden="true"
      className="mt-2 flex h-full w-16 flex-col gap-1 rounded-t-sm bg-white p-2 text-neutral-800 shadow-sm"
    >
      <div className="h-3 shrink-0 rounded-xs bg-sky-100" />
      <span className="text-[6px] leading-none font-semibold">
        Project brief
      </span>
      <span className="h-px rounded-full bg-neutral-300" />
      <span className="h-px w-4/5 rounded-full bg-neutral-300" />
      <span className="h-px w-3/5 rounded-full bg-neutral-300" />
    </div>
  );
}
