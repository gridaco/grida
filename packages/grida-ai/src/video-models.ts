// GRIDA-SEC-004 / GRIDA-SEC-006 — fixed provider video wires and scoped GG submission.
// GRIDA-GG: token — hosted video is text-only and uses the shared live-token contract.
import { createGateway } from "@ai-sdk/gateway";
import { assertAllowedUrl, falQueueOutcome, pollQueue } from "./fetch-helpers";
import { postHosted } from "./gg";
import type { GgTokenSource } from "./gg-session";
import { MediaRequest } from "./media-request";
import { MediaInputs } from "./media-inputs";

/** Internal adapters. No raw model, credentials, provider metadata, or queue handles are public. */
export namespace videoModels {
  export const maxBytes = MediaInputs.limits.video;
  export const maxEnvelopeBytes = Math.ceil(maxBytes / 3) * 4 + 64 * 1024;
  export const vercelBase = "https://ai-gateway.vercel.sh/v3/ai";
  const falHosts = ["fal.run", "*.fal.run", "fal.media", "*.fal.media"];
  const openRouterBase = "https://openrouter.ai/api/v1/videos";
  export type Input = {
    prompt: string;
    aspect_ratio?: `${number}:${number}`;
    resolution?: `${number}x${number}`;
    duration?: number;
    fps?: number;
    seed?: number;
    image_url?: string;
  };
  export type Video =
    | { type: "url"; url: string; mediaType: string }
    | { type: "base64"; data: string; mediaType: string }
    | { type: "binary"; data: Uint8Array; mediaType: string };

  export async function byok(
    provider: "openrouter" | "vercel" | "fal",
    key: string,
    id: string,
    input: Input,
    request: MediaRequest
  ): Promise<Video[]> {
    request.check();
    if (provider === "fal") return fal(key, id, input, request);
    if (provider === "openrouter") return openRouter(key, id, input, request);
    const model = createGateway({
      apiKey: key,
      baseURL: vercelBase,
      fetch: request.transport(videoModels.maxEnvelopeBytes).request,
    }).videoModel(id);
    // Call the model directly: the high-level SDK adds retries and automatic URL downloads.
    const result = await request.wait(
      model.doGenerate({
        prompt: input.prompt,
        n: 1,
        aspectRatio: input.aspect_ratio,
        resolution: input.resolution,
        duration: input.duration,
        fps: input.fps,
        seed: input.seed,
        image: input.image_url
          ? { type: "url", url: input.image_url }
          : undefined,
        providerOptions: {},
        abortSignal: request.signal,
      })
    );
    return result.videos;
  }

  export async function hosted(
    session: GgTokenSource,
    base: string,
    id: string,
    input: Input,
    request: MediaRequest
  ): Promise<Video[]> {
    request.check();
    const result = await request.wait(
      postHosted<{ videos: { base64: string; media_type: string }[] }>({
        session,
        url: new URL("/api/v1/ai/videos/generations", base).toString(),
        body: { model_id: id, ...wire(input) },
        scope: "video",
        abortSignal: request.signal,
        provider_http: request.transport(videoModels.maxEnvelopeBytes),
        max_response_bytes: videoModels.maxEnvelopeBytes,
      })
    );
    if (
      !Array.isArray(result.videos) ||
      !result.videos.length ||
      result.videos.length > 16
    )
      invalid();
    return result.videos.map((item) => ({
      type: "base64",
      data: item.base64,
      mediaType: item.media_type,
    }));
  }

  async function fal(
    key: string,
    id: string,
    input: Input,
    request: MediaRequest
  ): Promise<Video[]> {
    const headers = {
      authorization: `Key ${key}`,
      "content-type": "application/json",
    };
    // This exact existing binding has a different required start-frame field.
    // https://fal.ai/models/alibaba/wan-3.0/image-to-video/api
    const frame =
      id === "alibaba/wan-3.0/image-to-video" ? "start_image_url" : "image_url";
    const submit = await request.json<{
      status_url: string;
      response_url: string;
    }>(`https://queue.fal.run/${id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...wire(input),
        ...(input.image_url ? { [frame]: input.image_url } : {}),
      }),
    });
    allowed(submit.status_url, falHosts);
    allowed(submit.response_url, falHosts);
    await request.wait(
      pollQueue<{ status: string }>(
        submit.status_url,
        {
          fetch: request.transport().request,
          headers,
          timeoutMs: 300_000,
          intervalMs: 2_000,
          label: "video",
          classify: falQueueOutcome,
        },
        request.signal
      )
    );
    const result = await request.json<{
      video?: { url: string; content_type?: string };
      videos?: { url: string; content_type?: string }[];
    }>(submit.response_url, { headers });
    const videos = result.videos ?? (result.video ? [result.video] : []);
    if (!Array.isArray(videos) || !videos.length || videos.length > 16)
      invalid();
    return videos.map((item) => {
      allowed(item.url, falHosts);
      return {
        type: "url",
        url: item.url,
        mediaType: item.content_type ?? "video/mp4",
      };
    });
  }

  async function openRouter(
    key: string,
    id: string,
    input: Input,
    request: MediaRequest
  ): Promise<Video[]> {
    const headers = {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    };
    const { resolution: _resolution, ...body } = wire(input);
    const submit = await request.json<{ id: string; polling_url?: string }>(
      openRouterBase,
      {
        method: "POST",
        headers,
        // OpenRouter distinguishes an exact first frame from style/content references.
        // https://openrouter.ai/docs/guides/overview/multimodal/video-generation#using-images
        body: JSON.stringify({
          model: id,
          ...body,
          ...(input.resolution ? { size: input.resolution } : {}),
          ...(input.image_url
            ? {
                frame_images: [
                  {
                    type: "image_url",
                    image_url: { url: input.image_url },
                    frame_type: "first_frame",
                  },
                ],
              }
            : {}),
        }),
      }
    );
    if (typeof submit.id !== "string" || !submit.id || submit.id.length > 4096)
      invalid();
    const url = `${openRouterBase}/${encodeURIComponent(submit.id)}`;
    const poll = submit.polling_url ?? url;
    allowed(poll, ["openrouter.ai", "*.openrouter.ai"]);
    await request.wait(
      pollQueue<{ status?: string }>(
        poll,
        {
          fetch: request.transport().request,
          headers,
          timeoutMs: 300_000,
          intervalMs: 2_000,
          label: "video",
          classify: (body) =>
            body.status === "completed"
              ? "done"
              : ["failed", "cancelled", "expired"].includes(body.status ?? "")
                ? { failed: "generation failed" }
                : "pending",
        },
        request.signal
      )
    );
    // Only authenticated same-origin content is used; unsigned_urls never grant download authority.
    const response = await request.request(
      `${url}/content?index=0`,
      { headers },
      videoModels.maxBytes
    );
    if (!response.ok) throw new MediaRequest.Failure("generation_failed");
    const data = new Uint8Array(await request.wait(response.arrayBuffer()));
    return [
      {
        type: "binary",
        data,
        mediaType: response.headers.get("content-type") ?? "video/mp4",
      },
    ];
  }

  function wire(input: Input) {
    return {
      prompt: input.prompt,
      ...(input.aspect_ratio ? { aspect_ratio: input.aspect_ratio } : {}),
      ...(input.resolution ? { resolution: input.resolution } : {}),
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
      ...(input.fps !== undefined ? { fps: input.fps } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
    };
  }

  function allowed(value: string, hosts: string[]) {
    assertAllowedUrl(value, hosts, "video");
    const url = new URL(value);
    if (url.username || url.password || url.hash) invalid();
  }
  function invalid(): never {
    throw new MediaRequest.Failure("invalid_response");
  }
}
