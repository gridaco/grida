// Re-export the canonical doc-summary shape from the shared storage
// layer. Slides used to own a richer page model with embedded SVG
// content; the per-doc bytes now live inside the `SvgDocStore`'s
// AgentFs, so the UI only needs the summary.

export type { SvgDocSummary as SlidePage } from "../../../_storage";

export { BLANK_SLIDE_SVG as EMPTY_SLIDE_SVG } from "./templates";
