// GRIDA-SEC-006 / GRIDA-SEC-012
// GRIDA-GG: gateway — fixed feature binding, metered by the server seam.
import { ggMediaApi } from "@/lib/api/gg-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;
const handlers = ggMediaApi.bind("gg.3d.rig-check");
export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
