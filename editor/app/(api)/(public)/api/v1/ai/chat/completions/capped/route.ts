// GRIDA-SEC-006 / GRIDA-GG: gateway — distinct route refuses unsupported deployments.
// Never fall back to ordinary inference when this route is unavailable.
import { NativeChatRoute } from "@/lib/ai/native-chat-route";

export const POST = NativeChatRoute.capped;
export const maxDuration = 300;
