// GRIDA-SEC-004 — separate structured eligibility and bounded rigged-mesh operations.
// GRIDA-SEC-006 — scoped credentials never accompany provider uploads.
// GRIDA-GG: provider — explicitly selected funded checks and rigging.
import { catalog } from "@grida/ai-models/grida";
import { InputSchema } from "./input-schema";
import { RiggingInputs } from "./rigging-inputs";
import { ProviderCredentials } from "./provider-credentials";
import { ProviderHttp } from "./http";
import { MediaRequest } from "./media-request";
import { MediaInputs } from "./media-inputs";
import { TripoTransport } from "./tripo-transport";
import { delay } from "./fetch-helpers";
import type { GgTokenSource } from "./gg-session";
import { GgTripo } from "./gg-tripo";

/** Standalone mesh eligibility and explicit rigging; hosts supply bytes and authority. */
export class RiggingClient {
  readonly #http: ProviderHttp;
  readonly #getKey: RiggingClient.Keys["get"];
  readonly #gg?: GgTripo;
  constructor(options: RiggingClient.Options) {
    try {
      InputSchema.exact(options, ["http", "keys", "gg", "gg_base_url"]);
      if (
        !(options.http instanceof ProviderHttp) ||
        typeof options.keys.get !== "function"
      )
        throw 0;
      this.#http = options.http;
      this.#getKey = options.keys.get.bind(options.keys);
      if (
        options.gg !== undefined &&
        typeof options.gg.getAccessToken !== "function"
      )
        throw 0;
      if (options.gg && options.gg_base_url)
        this.#gg = new GgTripo(options.gg, options.gg_base_url);
    } catch {
      throw new RiggingClient.Failure("invalid_input");
    }
  }

  resolve(
    input: RiggingClient.CheckSelection
  ): Promise<RiggingClient.CheckOperation>;
  resolve<M extends RiggingClient.ModelId>(
    input: RiggingClient.RigSelection<M>
  ): Promise<RiggingClient.Operation<M>>;
  resolve(
    input: RiggingClient.RigSelection<string>
  ): Promise<RiggingClient.Operation>;
  resolve(
    input: RiggingClient.Selection<string>
  ): Promise<RiggingClient.Resolved>;
  async resolve(
    input: RiggingClient.Selection<string>
  ): Promise<RiggingClient.Resolved> {
    let request: MediaRequest | undefined;
    try {
      const selected = selection(input);
      request = new MediaRequest(this.#http);
      if (selected.provider === "gg") {
        if (!this.#gg) throw new TripoTransport.Failure("gg_token_expired");
        this.#gg.ready();
      } else await this.#key(request);
      if (selected.feature === "rig-check")
        return Object.freeze({
          feature: "rig-check",
          provider_id: selected.provider,
          binding_id: "rig-check",
          check: (input: RiggingClient.CheckInput) =>
            this.#execute(
              selected,
              input
            ) as Promise<RiggingClient.CheckResult>,
          checkUploaded: (input: RiggingClient.UploadedCheckInput) =>
            this.#execute(
              selected,
              input,
              true
            ) as Promise<RiggingClient.CheckResult>,
        });
      const descriptor = Object.freeze({
        feature: "rigging" as const,
        model_id: selected.model_id,
        provider_id: selected.provider,
        binding_id:
          catalog.three_d.rigging.models[selected.model_id].binding_id,
      });
      return Object.freeze({
        ...descriptor,
        generate: (input: RiggingClient.Input) =>
          this.#execute(selected, input) as Promise<RiggingClient.Result>,
        generateUploaded: (input: RiggingClient.UploadedInput) =>
          this.#execute(selected, input, true) as Promise<RiggingClient.Result>,
      }) as RiggingClient.Operation;
    } catch (error) {
      throw failure(error, request);
    } finally {
      request?.dispose();
    }
  }

  async #key(request: MediaRequest): Promise<string> {
    request.check();
    const value = await request.wait(Promise.resolve(this.#getKey("tripo")));
    request.check();
    try {
      return ProviderCredentials.normalize("tripo", value);
    } catch {
      throw new TripoTransport.Failure("provider_key_required");
    }
  }

  async #execute(
    selected: RiggingClient.Selection,
    input:
      | RiggingClient.CheckInput
      | RiggingClient.Input
      | RiggingClient.UploadedCheckInput
      | RiggingClient.UploadedInput,
    uploaded = false
  ): Promise<RiggingClient.CheckResult | RiggingClient.Result> {
    let request: MediaRequest | undefined;
    let taskId: string | undefined;
    let completedTask: RiggingClient.Task | undefined;
    try {
      let normalized:
        | RiggingClient.CheckInput
        | RiggingClient.Input
        | RiggingClient.UploadedCheckInput
        | RiggingClient.UploadedInput;
      try {
        normalized =
          selected.feature === "rig-check"
            ? InputSchema.native<
                RiggingClient.CheckInput | RiggingClient.UploadedCheckInput
              >(
                uploaded ? RiggingInputs.uploadedCheck : RiggingInputs.check,
                input
              )
            : InputSchema.native<
                RiggingClient.Input | RiggingClient.UploadedInput
              >(
                uploaded
                  ? RiggingInputs.uploadedRig(selected.model_id)
                  : RiggingInputs.rig(selected.model_id),
                input
              );
      } catch {
        throw new TripoTransport.Failure("invalid_input");
      }
      request = new MediaRequest(
        this.#http,
        normalized.signal,
        selected.provider === "gg" ? 780_000 : 600_000
      );
      if (selected.provider === "gg") {
        if (uploaded) throw new TripoTransport.Failure("invalid_input");
        if (!this.#gg) throw new TripoTransport.Failure("gg_token_expired");
        return await this.#gg.rig(
          request,
          selected,
          normalized as RiggingClient.CheckInput | RiggingClient.Input
        );
      }
      const key = await this.#key(request);
      const token =
        "data" in normalized.mesh
          ? await TripoTransport.upload(request, key, normalized.mesh)
          : normalized.mesh.file_token;
      if (token.includes(key))
        throw new TripoTransport.Failure("invalid_input");
      const body =
        selected.feature === "rig-check"
          ? { input: token }
          : {
              input: token,
              model:
                catalog.three_d.rigging.models[selected.model_id].binding_id,
              rig_type: (normalized as RiggingClient.Input).rig_type,
              spec: (normalized as RiggingClient.Input).spec,
              out_format: "glb",
            };
      // Exactly one explicit operation submission. No implicit eligibility job or POST retry.
      const submitted = await TripoTransport.json(
        request,
        key,
        selected.feature === "rig-check"
          ? "/animations/rig-check"
          : "/animations/rig",
        "POST",
        JSON.stringify(body)
      );
      const accepted = TripoTransport.identifier(submitted.task_id);
      if (accepted.includes(key)) TripoTransport.invalid();
      taskId = accepted;
      for (;;) {
        const task = await TripoTransport.json(
          request,
          key,
          `/tasks/${taskId}`,
          "GET"
        );
        if (
          task.task_id !== taskId ||
          // The v3 animation endpoints also return their legacy task kinds.
          // Admit only observed aliases for the selected operation.
          !(selected.feature === "rig-check"
            ? task.type === "rig_check" || task.type === "animate_prerigcheck"
            : task.type === "rig" || task.type === "animate_rig") ||
          typeof task.status !== "string"
        )
          TripoTransport.invalid();
        if (task.status === "success") {
          completedTask = TripoTransport.task(taskId, task.credits_consumed);
          if (!TripoTransport.record(task.output)) TripoTransport.invalid();
          if (selected.feature === "rig-check") {
            const { riggable, rig_type } = task.output;
            if (
              typeof riggable !== "boolean" ||
              typeof rig_type !== "string" ||
              !(
                catalog.three_d.rig_check.operation
                  .rig_types as readonly string[]
              ).includes(rig_type)
            )
              TripoTransport.invalid();
            request.check();
            return {
              riggable,
              rig_type: rig_type as RiggingClient.RigType,
              task: completedTask,
            };
          }
          const downloaded = await request.download(
            TripoTransport.assetUrl(task.output.model_url),
            MediaInputs.limits.glb
          );
          TripoTransport.validateGlb(downloaded.data);
          request.check();
          return {
            glb: { data: downloaded.data, media_type: "model/gltf-binary" },
            task: completedTask,
          };
        }
        if (["failed", "cancelled", "banned", "expired"].includes(task.status))
          throw new TripoTransport.Failure("generation_failed");
        if (
          (task.status !== "queued" && task.status !== "running") ||
          !Number.isInteger(task.progress) ||
          (task.progress as number) < 0 ||
          (task.progress as number) > 100
        )
          TripoTransport.invalid();
        await request.wait(delay(2_000, request.signal));
      }
    } catch (error) {
      throw failure(error, request, taskId, completedTask);
    } finally {
      request?.dispose();
    }
  }
}

export namespace RiggingClient {
  export const max_mesh_bytes = RiggingInputs.maxMeshBytes;
  export const max_glb_bytes = MediaInputs.limits.glb;
  export type ModelId = catalog.three_d.rigging.ModelId;
  export type RigType = catalog.three_d.rigging.RigType;
  export type Spec = catalog.three_d.rigging.Spec;
  export type Keys = {
    get(provider: "tripo"): string | null | Promise<string | null>;
  };
  export type Provider = "tripo" | "gg";
  export type Options = {
    keys: Keys;
    http: ProviderHttp;
    gg?: GgTokenSource;
    gg_base_url?: string;
  };
  export type Mesh = { data: Uint8Array; media_type: "model/gltf-binary" };
  export type UploadedMesh = {
    file_token: string;
    media_type: "model/gltf-binary";
  };
  export type Task = TripoTransport.Task;
  export type CheckSelection = { feature: "rig-check"; provider: Provider };
  export type RigSelection<M extends string = ModelId> = {
    feature: "rigging";
    provider: Provider;
    model_id: M;
  };
  export type Selection<M extends string = ModelId> =
    | CheckSelection
    | RigSelection<M>;
  export type CheckInput = { mesh: Mesh; signal?: AbortSignal };
  export type UploadedCheckInput = { mesh: UploadedMesh; signal?: AbortSignal };
  export type Input<M extends ModelId = ModelId> = CheckInput & {
    rig_type: M extends "tripo/rig-v1.0" ? "biped" : Exclude<RigType, "biped">;
    spec: Spec;
  };
  export type UploadedInput<M extends ModelId = ModelId> = Omit<
    Input<M>,
    "mesh"
  > & { mesh: UploadedMesh };
  export type CheckResult = {
    riggable: boolean;
    rig_type: RigType;
    task: Task;
  };
  export type Result = { glb: Mesh; task: Task };
  export type CheckOperation = Readonly<{
    feature: "rig-check";
    provider_id: Provider;
    binding_id: "rig-check";
    check(input: CheckInput): Promise<CheckResult>;
    /** Direct-provider check of an authorized uploaded mesh; never accepts URLs. */
    checkUploaded(input: UploadedCheckInput): Promise<CheckResult>;
  }>;
  export type Operation<M extends ModelId = ModelId> = {
    [K in M]: Readonly<{
      feature: "rigging";
      model_id: K;
      provider_id: Provider;
      binding_id: catalog.three_d.rigging.ModelCard["binding_id"];
      generate(input: Input<K>): Promise<Result>;
      /** Direct-provider execution of an authorized uploaded mesh; never accepts URLs. */
      generateUploaded(input: UploadedInput<K>): Promise<Result>;
    }>;
  }[M];
  export type Resolved = CheckOperation | Operation;
  export type FailureCode = TripoTransport.FailureCode;
  export class Failure extends Error {
    readonly code: FailureCode;
    readonly task_id?: string;
    readonly completed_task?: Task;
    constructor(code: FailureCode, task_id?: string, completed_task?: Task) {
      const safe = TripoTransport.codes.includes(code)
        ? code
        : "generation_failed";
      super(safe);
      this.name = "RiggingFailure";
      this.code = safe;
      if (
        typeof task_id === "string" &&
        TripoTransport.validIdentifier(task_id)
      )
        this.task_id = task_id;
      this.completed_task = TripoTransport.completedTask(
        completed_task,
        this.task_id
      );
    }
    toJSON() {
      return {
        code: this.code,
        message: this.code,
        ...(this.task_id ? { task_id: this.task_id } : {}),
        ...(this.completed_task ? { completed_task: this.completed_task } : {}),
      };
    }
  }
}
function selection(
  input: RiggingClient.Selection<string>
): RiggingClient.Selection {
  try {
    InputSchema.exact(
      input,
      input.feature === "rig-check"
        ? ["feature", "provider"]
        : ["feature", "provider", "model_id"]
    );
    if (
      (input.provider !== "tripo" && input.provider !== "gg") ||
      !["rig-check", "rigging"].includes(input.feature)
    )
      throw 0;
    if (input.feature === "rig-check")
      return { feature: input.feature, provider: input.provider };
    if (
      typeof input.model_id !== "string" ||
      !input.model_id ||
      input.model_id.length > 256
    )
      throw 0;
    if (!catalog.three_d.rigging.is_model_id(input.model_id))
      throw new TripoTransport.Failure("model_unavailable");
    return {
      feature: input.feature,
      provider: input.provider,
      model_id: input.model_id,
    };
  } catch (error) {
    if (error instanceof TripoTransport.Failure) throw error;
    throw new TripoTransport.Failure("invalid_input");
  }
}
function failure(
  error: unknown,
  request?: MediaRequest,
  task_id?: string,
  completed_task?: RiggingClient.Task
) {
  try {
    if (error instanceof TripoTransport.Failure) {
      task_id ??= error.task_id;
      completed_task ??= error.completed_task;
    }
  } catch {
    /* Untrusted host exceptions may trap prototype/property reads. */
  }
  return new RiggingClient.Failure(
    TripoTransport.failureCode(error, request),
    task_id,
    completed_task
  );
}
