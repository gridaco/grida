"use client";

import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DotsVerticalIcon } from "@radix-ui/react-icons";

export type SiteGeneral = {
  title: string | null;
  description: string | null;
  /**
   * Default/fallback language for public/tenant-facing experiences (e.g. verification emails).
   * Keep this a short language code like "en", "ko".
   */
  lang: string;
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
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="title">Site Title</FieldLabel>
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
        </Field>

        <Field>
          <FieldLabel htmlFor="description">Site Description</FieldLabel>
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
        </Field>

        <Field>
          <FieldLabel>Default (fallback) language</FieldLabel>
          <Select
            value={value.lang}
            onValueChange={(v) =>
              onValueChange?.({
                ...value,
                lang: v,
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English (default)</SelectItem>
              <SelectItem value="ko">Korean / 한국어</SelectItem>
              <SelectItem value="ja">Japanese / 日本語</SelectItem>
              <SelectItem value="es">Spanish / Español</SelectItem>
              <SelectItem value="zh">Chinese / 中文</SelectItem>
            </SelectContent>
          </Select>
          <FieldDescription>
            Grida first tries the visitor’s device language. If it’s not
            supported, it falls back to this language.
            <br />
            Targeting a global audience? Keep this as English. Targeting a
            specific locale? Set it to match.
          </FieldDescription>
        </Field>
      </FieldGroup>

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
