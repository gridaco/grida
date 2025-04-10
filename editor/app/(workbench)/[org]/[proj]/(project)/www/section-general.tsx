"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DotsVerticalIcon } from "@radix-ui/react-icons";

export type SiteGeneral = {
  title: string | null;
  description: string | null;
};

export function SiteGeneralSection({
  url,
  value,
  onValueChange,
  disabled,
}: {
  url: string;
  value: SiteGeneral;
  onValueChange?: (value: SiteGeneral) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="title">Site Title</Label>
          <Input
            id="title"
            value={value.title ?? ""}
            disabled={disabled}
            onChange={(e) =>
              onValueChange?.({
                ...value,
                title: e.target.value,
              })
            }
            placeholder="Enter your site title"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="description">Site Description</Label>
          <Textarea
            id="description"
            disabled={disabled}
            value={value.description ?? ""}
            onChange={(e) =>
              onValueChange?.({
                ...value,
                description: e.target.value,
              })
            }
            placeholder="Enter your site description"
            rows={3}
          />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium mb-2">Preview</h3>
        <GoogleSearchPreview
          url={url}
          title={value.title || "Site Title"}
          description={value.description || "Site description goes here"}
        />
      </div>
    </div>
  );
}

function GoogleSearchPreview({
  url = "www.example.com",
  title,
  description,
}: {
  url?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border rounded-md p-4 bg-white dark:bg-[#101217]">
      <div className="text-muted-foreground/80 flex items-center gap-2 mb-1">
        <div className="text-xs truncate">{url}</div>
        <DotsVerticalIcon className="size-3" />
      </div>
      <div className="text-[#180EA4] dark:text-[#87A9F9] truncate mb-2">
        {title}
      </div>
      <div className="text-muted-foreground text-sm line-clamp-2">
        {description}
      </div>
    </div>
  );
}
