import { Tokens } from "@/ast";
import { WorkbenchUI } from "@/components/workbench";
import { useDocumentAssetUpload } from "@/scaffolds/asset";
import { cn } from "@/utils";
import { Cross2Icon } from "@radix-ui/react-icons";
import { useEffect } from "react";
import toast from "react-hot-toast";
import { useFilePicker } from "use-file-picker";

export function SrcControl({
  value = "",
  onValueChange,
}: {
  value?: Tokens.StringValueExpression;
  onValueChange?: (value?: Tokens.StringValueExpression) => void;
}) {
  const { uploadPublic } = useDocumentAssetUpload();

  const { openFilePicker, plainFiles, loading } = useFilePicker({
    readAs: "ArrayBuffer",
    accept: "image/*",
    multiple: false,
  });

  useEffect(
    () => {
      if (plainFiles.length > 0) {
        const uploading = uploadPublic(plainFiles[0]).then((r) =>
          onValueChange?.(r.publicUrl)
        );
        toast.promise(uploading, {
          loading: "Uploading...",
          success: "Uploaded",
          error: "Failed to upload",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plainFiles]
  );

  return (
    <div
      onClick={openFilePicker}
      className={cn(
        "flex items-center border cursor-default",
        WorkbenchUI.inputVariants({ size: "sm" })
      )}
    >
      {value ? (
        <>
          <div className="flex items-center flex-1">
            {typeof value === "string" && <Thumb src={value} />}
            <span className="ms-2 text-xs">Image</span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onValueChange?.(undefined);
            }}
          >
            <Cross2Icon className="w-3 h-3 text-muted-foreground" />
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center flex-1 text-muted-foreground">
            <ThumbPlaceholder />
            <span className="ms-2 text-xs">Add...</span>
          </div>
        </>
      )}
    </div>
  );
}

function Thumb({ src }: { src: string }) {
  return (
    <img
      src={src}
      width={40}
      height={40}
      className="object-cover w-6 h-6 overflow-hidden rounded border"
    />
  );
}

function ThumbPlaceholder() {
  return (
    <div className="w-6 h-6 overflow-hidden rounded border bg-secondary" />
  );
}
