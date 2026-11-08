// GRIDA-SEC-006 / GRIDA-SEC-012 — fixed scoped AI binding.
import { ggOperationsApi } from "@/lib/api/gg-operations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800;
const handlers = ggOperationsApi.bind("gg.jobs");
export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
