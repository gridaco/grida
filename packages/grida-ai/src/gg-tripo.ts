// GRIDA-SEC-004 / GRIDA-SEC-006 — fixed upload destination; GG credentials never reach signed uploads.
// GRIDA-GG: provider — scoped 3D requests and bounded streamed JSON results.
import { catalog } from "@grida/ai-models/grida";
import type { GgTokenSource } from "./gg-session";
import { gridaGatewayOrigin, readGgToken } from "./gg";
import { InputSchema } from "./input-schema";
import { MediaInputs } from "./media-inputs";
import { MediaRequest } from "./media-request";
import type { TripoClient } from "./tripo-client";
import type { RiggingClient } from "./rigging-client";
import { TripoTransport } from "./tripo-transport";

/** Private adapter. Public operations continue to accept host-authorized bytes. */
export class GgTripo {
  readonly #origin: string;
  constructor(
    private readonly session: GgTokenSource,
    baseUrl: string
  ) {
    this.#origin = gridaGatewayOrigin(baseUrl);
  }

  ready(): void {
    readGgToken(this.session);
  }

  async generate(
    request: MediaRequest,
    descriptor: TripoClient.Descriptor,
    input: TripoClient.Input
  ): Promise<TripoClient.Result> {
    const { signal: _, ...body } = input;
    const encoded: Record<string, unknown> = { ...body };
    if ("image" in input)
      encoded.image = await this.#upload(request, input.image);
    if ("images" in input) {
      const images: Record<string, unknown> = {};
      for (const view of ["front", "left", "back", "right"] as const) {
        const image = input.images[view];
        if (image) images[view] = await this.#upload(request, image);
      }
      encoded.images = images;
    }
    const result = await this.#post(
      request,
      "/model-generation",
      {
        model_id: descriptor.model_id,
        variant: descriptor.variant,
        input: encoded,
      },
      GgTripo.maxResponseBytes
    );
    return GgTripo.modelResult(
      result,
      "model-generation",
      descriptor.model_id,
      descriptor.variant
    );
  }

  async rig(
    request: MediaRequest,
    selected: RiggingClient.Selection,
    input: RiggingClient.CheckInput | RiggingClient.Input
  ): Promise<RiggingClient.CheckResult | RiggingClient.Result> {
    const mesh = await this.#upload(request, input.mesh);
    if (selected.feature === "rig-check") {
      const result = await this.#post(
        request,
        "/rig-check",
        { input: { mesh } },
        16 * 1024
      );
      const task = GgTripo.receipt(result.task);
      try {
        if (
          result.provider_id !== "gg" ||
          result.feature !== "rig-check" ||
          typeof result.riggable !== "boolean" ||
          !catalog.three_d.rig_check.operation.rig_types.includes(
            result.rig_type as RiggingClient.RigType
          )
        )
          throw 0;
        return {
          riggable: result.riggable,
          rig_type: result.rig_type as RiggingClient.RigType,
          task,
        };
      } catch {
        throw new TripoTransport.Failure("invalid_response", task.id, task);
      }
    }
    const typed = input as RiggingClient.Input;
    const result = await this.#post(
      request,
      "/rigging",
      {
        model_id: selected.model_id,
        input: { mesh, rig_type: typed.rig_type, spec: typed.spec },
      },
      GgTripo.maxResponseBytes
    );
    return GgTripo.modelResult(result, "rigging", selected.model_id);
  }

  async #upload(
    request: MediaRequest,
    file: TripoClient.Image | RiggingClient.Mesh
  ): Promise<{ upload: string }> {
    const result = await this.#post(
      request,
      "/uploads",
      {
        media_type: file.media_type,
        byte_length: file.data.byteLength,
      },
      32 * 1024
    );
    if (
      typeof result.upload !== "string" ||
      !result.upload ||
      result.upload.length > 16 * 1024 ||
      typeof result.upload_url !== "string" ||
      result.upload_url.length > 16 * 1024
    )
      TripoTransport.invalid();
    let url: URL;
    try {
      url = new URL(result.upload_url);
    } catch {
      TripoTransport.invalid();
    }
    if (
      url.protocol !== "https:" ||
      url.hostname !== "tripo-data.s3.us-west-2.amazonaws.com" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      url.pathname === "/"
    )
      TripoTransport.invalid();
    const response = await request.request(
      url,
      {
        method: "PUT",
        body: new Uint8Array(file.data),
        headers: { "content-type": "application/octet-stream" },
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      },
      16 * 1024
    );
    await response.body?.cancel().catch(() => undefined);
    if (
      response.redirected ||
      response.type === "opaqueredirect" ||
      (response.url && response.url !== url.toString())
    )
      TripoTransport.invalid();
    if (!response.ok) throw new TripoTransport.Failure("generation_failed");
    request.check();
    return { upload: result.upload };
  }

  async #post(
    request: MediaRequest,
    path: string,
    body: unknown,
    maximum: number
  ): Promise<Record<string, unknown>> {
    const url = new URL(`/api/v1/ai/3d${path}`, this.#origin).toString();
    const response = await request.request(
      url,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          authorization: `Bearer ${readGgToken(this.session)}`,
          "content-type": "application/json",
        },
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
      },
      maximum
    );
    if (
      response.redirected ||
      response.type === "opaqueredirect" ||
      (response.url && response.url !== url)
    )
      TripoTransport.invalid();
    if (response.status === 401 || response.status === 402) {
      await response.body?.cancel().catch(() => undefined);
      throw new TripoTransport.Failure(
        response.status === 401 ? "gg_token_expired" : "insufficient_credits"
      );
    }
    let result: unknown;
    try {
      result = JSON.parse(await request.wait(response.text()));
    } catch (error) {
      if (error instanceof MediaRequest.Failure) throw error;
      TripoTransport.invalid();
    }
    if (!TripoTransport.record(result)) TripoTransport.invalid();
    const failure = TripoTransport.record(result.error) ? result.error : result;
    if (!response.ok || typeof failure.code === "string") {
      const id =
        typeof failure.task_id === "string" &&
        TripoTransport.validIdentifier(failure.task_id)
          ? failure.task_id
          : undefined;
      const completed = TripoTransport.record(failure.completed_task)
        ? TripoTransport.completedTask(
            failure.completed_task as TripoTransport.Task,
            id
          )
        : undefined;
      const code =
        typeof failure.code === "string" &&
        TripoTransport.codes.includes(
          failure.code as TripoTransport.FailureCode
        )
          ? (failure.code as TripoTransport.FailureCode)
          : failure.code === "invalid_request"
            ? "invalid_input"
            : failure.code === "provider_unavailable"
              ? "model_unavailable"
              : "generation_failed";
      throw new TripoTransport.Failure(code, id, completed);
    }
    return result;
  }
}

export namespace GgTripo {
  export const maxResponseBytes =
    Math.ceil(MediaInputs.limits.glb / 3) * 4 + 16 * 1024;
  export function receipt(value: unknown): TripoTransport.Task {
    const id =
      TripoTransport.record(value) &&
      typeof value.id === "string" &&
      TripoTransport.validIdentifier(value.id)
        ? value.id
        : undefined;
    try {
      if (
        !id ||
        !TripoTransport.record(value) ||
        typeof value.credits_consumed !== "number"
      )
        throw 0;
      return TripoTransport.task(id, value.credits_consumed);
    } catch {
      // Missing usage is not a zero-cost success. Retain only the observed
      // accepted identity so the host can reconcile without resubmission.
      throw new TripoTransport.Failure("invalid_response", id);
    }
  }
  export function modelResult(
    value: Record<string, unknown>,
    feature: "model-generation" | "rigging",
    modelId: string,
    variant?: string
  ): TripoClient.Result {
    const task = receipt(value.task);
    try {
      if (
        value.provider_id !== "gg" ||
        value.feature !== feature ||
        value.model_id !== modelId ||
        (variant !== undefined && value.variant !== variant) ||
        !TripoTransport.record(value.glb) ||
        value.glb.media_type !== "model/gltf-binary"
      )
        throw 0;
      const data = InputSchema.bytes(MediaInputs.limits.glb).parse(
        value.glb.base64,
        true
      );
      TripoTransport.validateGlb(data);
      return { glb: { data, media_type: "model/gltf-binary" }, task };
    } catch {
      throw new TripoTransport.Failure("invalid_response", task.id, task);
    }
  }
}
