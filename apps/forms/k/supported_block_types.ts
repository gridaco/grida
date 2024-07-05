import type { FormBlockType } from "@/types";

export const blocklabels: Record<FormBlockType, string> = {
  section: "Section",
  field: "Field",
  image: "Image",
  video: "Video",
  html: "HTML",
  divider: "Divider",
  header: "Header",
  pdf: "PDF",
  group: "Group",
};

export const supported_block_types: FormBlockType[] = [
  "section",
  "field",
  "image",
  "video",
  "html",
  "divider",
  "header",
  "pdf",
  // "group",
];
