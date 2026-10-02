import { defineNitroPlugin } from "nitropack/runtime";
import { getResponseStatus } from "h3";

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook("afterResponse", (event) => {
    const context = event.context.publicApi;
    if (!context) return;
    console.info(
      JSON.stringify({
        event: "api_request",
        request_id: context.requestId,
        method: event.method,
        status: getResponseStatus(event),
        duration_ms: Math.round(performance.now() - context.started),
      })
    );
  });
});
