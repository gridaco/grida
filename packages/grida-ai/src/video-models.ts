// GRIDA-SEC-004 / GRIDA-SEC-006 — fixed provider video wires and scoped GG submission.
// GRIDA-GG: token — hosted video is text-only and uses the shared live-token contract.
import { createGateway as createVercelAiGateway } from "@ai-sdk/gateway";
import { assertAllowedUrl, falQueueOutcome, pollQueue } from "./fetch-helpers";
import type { GgTokenSource } from "./gg-session";
import { MediaRequest } from "./media-request";
import { MediaInputs } from "./media-inputs";
import type { VideoClient } from "./video-client";
import { GGOperationsClient } from "./gg-operations";
import type { GGOperation, GGDiscoveryStore } from "./gg-discovery";

/** Internal adapters. No raw model, credentials, provider metadata, or queue handles are public. */
export namespace videoModels {
  export const maxBytes = MediaInputs.limits.video;
  export const maxEnvelopeBytes = Math.ceil(maxBytes / 3) * 4 + 64 * 1024;
  export const vercelAiGatewayVideoBaseUrl =
    "https://ai-gateway.vercel.sh/v3/ai";
  const falHosts = ["fal.run", "*.fal.run", "fal.media", "*.fal.media"];
  const openRouterBase = "https://openrouter.ai/api/v1/videos";
  export type Input = {
    prompt: string;
    aspect_ratio?: `${number}:${number}`;
    resolution?: `${number}x${number}`;
    duration?: number;
    fps?: number;
    generate_audio?: boolean;
    seed?: number;
    image_url?: string;
    image?: VideoClient.Image;
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
    const model = createVercelAiGateway({
      apiKey: key,
      baseURL: vercelAiGatewayVideoBaseUrl,
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
    request: MediaRequest,
    operation: GGOperation,
    discovery: GGDiscoveryStore,
    onAccepted?: (id: string) => void
  ): Promise<Video[]> {
    request.check();
    {
      const properties = operation.input_schema.properties as Record<
        string,
        Record<string, unknown>
      >;
      const body: Record<string, unknown> = { prompt: input.prompt };
      for (const [key, value] of Object.entries({
        duration: input.duration,
        seed: input.seed,
        fps: input.fps,
        generateAudio: input.generate_audio,
        image: input.image_url,
      })) {
        if (value !== undefined) {
          if (!Object.hasOwn(properties, key))
            throw new GGOperationsClient.Failure("invalid_input");
          body[key] = value;
        }
      }
      if (input.image) throw new GGOperationsClient.Failure("invalid_input");
      if (input.aspect_ratio) {
        const key = Object.hasOwn(properties, "aspectRatio")
          ? "aspectRatio"
          : Object.hasOwn(properties, "aspect_ratio")
            ? "aspect_ratio"
            : null;
        if (!key) throw new GGOperationsClient.Failure("invalid_input");
        body[key] = input.aspect_ratio;
      }
      if (input.resolution) {
        if (Object.hasOwn(properties, "resolution"))
          body.resolution = input.resolution;
        else if (Object.hasOwn(properties, "providerOptions")) {
          const pair = /^(\d+)x(\d+)$/.exec(input.resolution);
          if (!pair) throw new GGOperationsClient.Failure("invalid_input");
          const edge = Math.min(Number(pair[1]), Number(pair[2]));
          body.providerOptions = {
            gg: { resolutionTier: edge === 2160 ? "4k" : `${edge}p` },
          };
        } else throw new GGOperationsClient.Failure("invalid_input");
      }
      const client = new GGOperationsClient({
        http: request.transport(maxEnvelopeBytes),
        gg: session,
        gg_base_url: base,
        gg_catalog: discovery,
      });
      const submitted = await request.wait(
        client.submit(operation.id, body, request.signal)
      );
      if (
        typeof submitted.id !== "string" ||
        !/^req_[A-Za-z0-9_-]{1,160}$/.test(submitted.id)
      )
        invalid();
      onAccepted?.(submitted.id);
      const job = await request.wait(client.wait(submitted.id, request.signal));
      const videos = job.result?.videos;
      if (!Array.isArray(videos) || !videos.length || videos.length > 16)
        invalid();
      return videos.map((item) => {
        if (!item || typeof item !== "object" || typeof item.url !== "string")
          invalid();
        return {
          type: "url" as const,
          url: item.url,
          mediaType:
            typeof item.media_type === "string" ? item.media_type : "video/mp4",
        };
      });
    }
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
    const body = wire(input);
    const lite = id === MediaInputs.falVeoLite.binding_id;
    const resolution =
      lite && input.resolution
        ? MediaInputs.falVeoLite.resolutions[
            input.resolution as keyof typeof MediaInputs.falVeoLite.resolutions
          ]
        : undefined;
    const imageUrl = input.image ? imageDataUrl(input.image) : input.image_url;
    request.check();
    const submit = await request.json<{
      status_url: string;
      response_url: string;
    }>(`https://queue.fal.run/${id}`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        ...(lite && input.duration !== undefined
          ? { duration: `${input.duration}s` }
          : {}),
        ...resolution,
        ...(lite && input.generate_audio !== undefined
          ? { generate_audio: input.generate_audio }
          : {}),
        ...(imageUrl ? { [frame]: imageUrl } : {}),
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

  function imageDataUrl(image: VideoClient.Image): string {
    let binary = "";
    for (let offset = 0; offset < image.data.length; offset += 8192)
      binary += String.fromCharCode(
        ...image.data.subarray(offset, offset + 8192)
      );
    return `data:${image.media_type};base64,${btoa(binary)}`;
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
