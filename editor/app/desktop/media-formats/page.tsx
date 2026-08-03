import { redirect } from "next/navigation";
import { DesktopMediaTool } from "@/scaffolds/desktop/tools/media-tool-registry";

/** Compatibility redirect. The legacy media playground now lives in Tools. */
export default async function DesktopMediaFormatsPage({
  searchParams,
}: {
  searchParams: Promise<{ model?: string | string[] }>;
}) {
  const { model } = await searchParams;
  const modelId = Array.isArray(model) ? model[0] : model;
  redirect(modelId ? DesktopMediaTool.hrefForModel(modelId) : "/desktop/tools");
}
