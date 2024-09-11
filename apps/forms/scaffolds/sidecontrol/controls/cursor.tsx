import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cursors } from "./k/cursors";
import Image from "next/image";
import { WorkbenchUI } from "@/components/workbench";

export function CursorControl({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value?: string) => void;
}) {
  const cursor = (cursors as any)[value || "default"];

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={WorkbenchUI.inputVariants({ size: "sm" })}>
        <SelectValue placeholder="Select...">
          <div className="flex gap-1 items-center text-xs">
            <Image src={cursor.src} width={16} height={16} alt={cursor.label} />
            <span className="overflow-hidden text-ellipsis">
              {cursor.label}
            </span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.entries(cursors).map(([key, value]) => {
          return (
            <SelectItem key={key} value={key}>
              <div className="flex gap-2 items-center">
                <Image
                  src={value.src}
                  width={24}
                  height={24}
                  alt={value.label}
                />
                <span>{value.label}</span>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
