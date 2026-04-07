import { PropertyEnumV2, EnumItem } from "../ui";
import InputPropertyNumber from "../ui/number";
import { cn } from "@/components/lib/utils";
import type { editor } from "@/grida-canvas";
import type { TMixed } from "./utils/types";
import { usePropertyPreview } from "@/grida-canvas-react/hooks/use-property-change";
import { useCallback, useMemo } from "react";

export function FontSizeControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
  onValueCommit?: (change: editor.api.NumberChange) => void;
}) {
  const apply = useCallback(
    (v: string) => {
      const num = parseInt(v);
      onValueCommit?.({ type: "set", value: num });
    },
    [onValueCommit]
  );

  const preview = usePropertyPreview<string>("font-size", apply);

  const enumItems: EnumItem<string>[] = useMemo(
    () =>
      Object.entries(twsizes).map(([, preset]) => ({
        value: String(preset["font-size"]),
        label: String(preset["font-size"]),
      })),
    []
  );

  const stringValue = typeof value === "number" ? String(value) : undefined;

  return (
    <div className="relative flex-1">
      <InputPropertyNumber
        mode="auto"
        type="integer"
        value={value}
        placeholder="inherit"
        min={1}
        step={1}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
        className={cn(
          "overflow-hidden",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        )}
      />
      <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center border-l">
        <PropertyEnumV2
          value={(preview.committedValue ?? stringValue) as any}
          enum={enumItems}
          className="border-none shadow-none bg-transparent h-6 w-6 min-w-0 p-0 justify-center"
          renderTriggerValue={() => null}
          renderItem={(v) => {
            const preset = twsizesByValue[v];
            return (
              <>
                {v}{" "}
                {preset && (
                  <span className="text-muted-foreground text-xs">
                    {preset.name}
                  </span>
                )}
              </>
            );
          }}
          onOpenChange={(open) => {
            if (open) preview.onOpen(stringValue ?? "16");
            else preview.onClose();
          }}
          onValueSeeked={preview.onSeek}
          onValueChange={(v) => {
            const num = parseInt(v);
            onValueCommit?.({ type: "set", value: num });
            preview.onCommit(v);
          }}
        />
      </div>
    </div>
  );
}

const twsizes = {
  "text-xs": {
    "font-size": 12,
    name: "xs",
  },
  "text-sm": {
    "font-size": 14,
    name: "sm",
  },
  "text-base": {
    "font-size": 16,
    name: "base",
  },
  "text-lg": {
    "font-size": 18,
    name: "lg",
  },
  "text-xl": {
    "font-size": 20,
    name: "xl",
  },
  "text-2xl": {
    "font-size": 24,
    name: "2xl",
  },
  "text-3xl": {
    "font-size": 30,
    name: "3xl",
  },
  "text-4xl": {
    "font-size": 36,
    name: "4xl",
  },
  "text-5xl": {
    "font-size": 48,
    name: "5xl",
  },
  "text-6xl": {
    "font-size": 60,
    name: "6xl",
  },
  "text-7xl": {
    "font-size": 72,
    name: "7xl",
  },
  "text-8xl": {
    "font-size": 96,
    name: "8xl",
  },
  "text-9xl": {
    "font-size": 128,
    name: "9xl",
  },
};

const twsizesByValue = Object.fromEntries(
  Object.values(twsizes).map((p) => [String(p["font-size"]), p])
);
