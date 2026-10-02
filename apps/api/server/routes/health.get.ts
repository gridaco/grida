import { defineEventHandler } from "h3";

// Liveness only. A healthy process is not proof of backend or release readiness.
export default defineEventHandler(() => ({ status: "ok" }));
