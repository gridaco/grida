import { FileIO } from "@/lib/file";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useEffect } from "react";
import { useFilePicker } from "use-file-picker";
import ReactPlayer from "react-player";

interface ImageAssetFieldProps {
  uploader: FileIO.GridaAssetUploaderFn;
  value?: FileIO.GridaAsset[];
  onValueChange?: (value?: FileIO.GridaAsset[]) => void;
}

interface BucketFileFieldProps {
  uploader: FileIO.BucketFileUploaderFn;
  value?: { publicUrl: string };
  onValueChange?: (value: FileIO.UploadResult | null) => void;
}

export function CMSVideoAssetField({
  value,
  uploader,
  onValueChange,
}: ImageAssetFieldProps) {
  const { openFilePicker, plainFiles, loading } = useFilePicker({
    readAs: "ArrayBuffer",
    accept: "video/*",
    multiple: false,
  });

  useEffect(
    () => {
      if (plainFiles.length > 0) {
        uploader(plainFiles[0]).then((r) =>
          onValueChange?.([...(value ?? []), r])
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plainFiles]
  );

  return (
    <div
      onClick={openFilePicker}
      className="flex gap-2 w-full h-20 bg-card rounded-md border shadow-card p-2 overflow-x-scroll"
    >
      {value && value.length > 0 ? (
        value.map((v) => (
          <AssetItem
            type="video"
            key={v.id}
            asset={v}
            onRemoveClick={() =>
              onValueChange?.(value.filter((it) => it.id !== v.id))
            }
          />
        ))
      ) : (
        <Placeholder />
      )}
    </div>
  );
}

export function CMSImageAssetField({
  value,
  uploader,
  onValueChange,
}: ImageAssetFieldProps) {
  const { openFilePicker, plainFiles, loading } = useFilePicker({
    readAs: "ArrayBuffer",
    accept: "image/*",
    multiple: false,
  });

  useEffect(
    () => {
      if (plainFiles.length > 0) {
        uploader(plainFiles[0]).then((r) =>
          onValueChange?.([...(value ?? []), r])
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plainFiles]
  );

  return (
    <div
      onClick={openFilePicker}
      className="flex gap-2 w-full h-20 bg-card rounded-md border shadow-card p-2 overflow-x-scroll"
    >
      {value && value.length > 0 ? (
        value.map((v) => (
          <AssetItem
            type="image"
            key={v.id}
            asset={v}
            onRemoveClick={() =>
              onValueChange?.(value.filter((it) => it.id !== v.id))
            }
          />
        ))
      ) : (
        <Placeholder />
      )}
    </div>
  );
}

export function CMSImageField({
  value,
  uploader,
  onValueChange,
}: BucketFileFieldProps) {
  const { openFilePicker, plainFiles, loading } = useFilePicker({
    readAs: "ArrayBuffer",
    accept: "image/*",
    multiple: false,
  });

  useEffect(
    () => {
      if (plainFiles.length > 0) {
        uploader(plainFiles[0]).then((r) => onValueChange?.(r));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plainFiles]
  );

  return (
    <div
      onClick={openFilePicker}
      className="flex gap-2 w-full h-20 bg-card rounded-md border shadow-card p-2 overflow-x-scroll"
    >
      {value ? (
        <AssetItem
          type="image"
          asset={value}
          onRemoveClick={() => onValueChange?.(null)}
        />
      ) : (
        <Placeholder />
      )}
    </div>
  );
}

function Placeholder() {
  return (
    <div className="relative aspect-[4/3] h-full">
      <div className="border shadow-sm w-full h-full object-cover rounded-lg overflow-hidden bg-muted-foreground/50"></div>
    </div>
  );
}

function AssetItem({
  type,
  asset,
  onClick,
  onRemoveClick,
}: {
  type: "video" | "image";
  asset: { publicUrl: string };
  onRemoveClick?: () => void;
  onClick?: () => void;
}) {
  return (
    <div onClick={onClick} className="relative aspect-[4/3] h-full">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemoveClick?.();
        }}
        className="absolute -top-2.5 -right-2.5 border shadow-sm rounded-full bg-background text-foreground flex items-center justify-center size-5"
      >
        <Cross2Icon className="size-3" />
      </button>
      {type === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="border shadow-sm w-full h-full object-cover rounded-lg overflow-hidden"
          src={asset.publicUrl}
          alt=""
        />
      ) : (
        <div className="border shadow-sm w-full h-full object-cover rounded-lg overflow-hidden">
          <ReactPlayer
            url={asset.publicUrl}
            muted
            playsinline
            playing
            width="100%"
            height="100%"
          />
        </div>
      )}
    </div>
  );
}
