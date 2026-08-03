import { redirect } from "next/navigation";
import { DesktopMediaTool } from "@/scaffolds/desktop/tools/media-tool-registry";

/** Compatibility redirect. Image generation now lives in Desktop Tools. */
export default async function DesktopImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[] }>;
}) {
  const { model } = await searchParams;
  const modelId = Array.isArray(model) ? model[0] : model;
  redirect(DesktopMediaTool.href("image-generator", modelId));
}
