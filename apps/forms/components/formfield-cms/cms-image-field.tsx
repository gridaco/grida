import { FileIO } from "@/lib/file";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useEffect } from "react";
import { useFilePicker } from "use-file-picker";

interface ImageAssetFieldProps {
  uploader: FileIO.GridaAssetUploaderFn;
  value?: FileIO.GridaAsset[];
  onValueChange?: (value?: FileIO.GridaAsset[]) => void;
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

  useEffect(() => {
    if (plainFiles.length > 0) {
      uploader(plainFiles[0]).then((r) =>
        onValueChange?.([...(value ?? []), r])
      );
    }
  }, [plainFiles]);

  return (
    <div
      onClick={openFilePicker}
      className="flex gap-2 w-full h-20 bg-card rounded-md border shadow-card p-2 overflow-x-scroll"
    >
      {value && value.length > 0 ? (
        value.map((v) => (
          <AssetItem
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

function Placeholder() {
  return (
    <div className="relative aspect-[4/3] h-full">
      <div className="border shadow-sm w-full h-full object-cover rounded-lg overflow-hidden bg-muted-foreground/50"></div>
    </div>
  );
}

function AssetItem({
  asset,
  onClick,
  onRemoveClick,
}: {
  asset: FileIO.GridaAsset;
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
        className="absolute -top-2.5 -right-2.5 border shadow-sm rounded-full bg-background text-foreground flex items-center justify-center w-5 h-5"
      >
        <Cross2Icon className="w-3 h-3" />
      </button>
      <img
        className="border shadow-sm w-full h-full object-cover rounded-lg overflow-hidden"
        src={asset.publicUrl}
      />
    </div>
  );
}
