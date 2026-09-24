// GRIDA-SEC-004 — narrow provider completion facts; never raw responses or credentials.
/** Internal lifecycle shared by image and video adapters. Hosts receive facts, not queue authority. */
export class FalGeneration {
  task_id?: string;

  constructor(
    readonly binding_id: string,
    readonly sink?: (receipt: FalGeneration.Completion) => void
  ) {}

  accepted(id: unknown): void {
    this.task_id = FalGeneration.taskId(id);
    if (this.sink && !this.task_id) throw new Error("invalid_response");
  }

  completed(output_count: number): void {
    if (
      !Number.isSafeInteger(output_count) ||
      output_count < 1 ||
      output_count > 16
    )
      throw new Error("invalid_response");
    if (!this.sink) return;
    if (!this.task_id) throw new Error("invalid_response");
    const result: unknown = this.sink(
      Object.freeze({
        provider_id: "fal",
        binding_id: this.binding_id,
        request_id: this.task_id,
        output_count,
      })
    );
    if (
      result &&
      (typeof result === "object" || typeof result === "function") &&
      "then" in result
    ) {
      void Promise.resolve(result).catch(() => undefined);
      throw new Error("invalid_completion_sink");
    }
  }

  static taskId(value: unknown): string | undefined {
    return typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
      ? value
      : undefined;
  }
}

export namespace FalGeneration {
  export type Completion = Readonly<{
    provider_id: "fal";
    binding_id: string;
    request_id: string;
    output_count: number;
  }>;
}
