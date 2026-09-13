// GRIDA-SEC-013 — explicit file selection and one normative SDK input contract.
import { MediaOperations } from "@grida/ai";
import type { Readable } from "node:stream";
import { Cli } from "./cli";
import { MediaFiles } from "./media-files";

/** Terminal inputs lower to the same JSON contract used by scripts. No provider policy. */
export namespace MediaInput {
  type Generate = Extract<Cli.MediaInvocation, { command: "generate" }>;
  type Selection = Extract<
    Cli.MediaInvocation,
    { command: "generate" | "models inspect" }
  >;
  type Schema = Record<string, unknown>;

  export function inspect(
    operations: MediaOperations,
    invocation: Selection
  ): MediaOperations.Descriptor {
    const candidates = operations.list({
      model_id: invocation.model,
      provider: invocation.provider,
      kind: invocation.kind,
    });
    const kinds = new Set(candidates.map((entry) => entry.kind));
    if (!kinds.size) throw new MediaOperations.Failure("operation_unavailable");
    if (kinds.size !== 1)
      invalid("Choose the operation with --kind; run grida models list.");
    const kind = candidates[0]!.kind;
    const request =
      invocation.command === "generate" ? invocation.request : undefined;
    let variant = invocation.variant;
    const inferred = request?.references
      ? "references"
      : request?.image !== undefined
        ? "image"
        : undefined;
    if (inferred) {
      if (variant !== undefined && variant !== inferred)
        invalid(
          "The media flag conflicts with --variant; select a compatible input variant."
        );
      if (inferred === "references" && kind !== "image")
        invalid(
          "--reference selects image-generation references. Inspect this operation for its media inputs."
        );
      if (inferred === "image" && !["video", "three-d"].includes(kind))
        invalid(
          "--image selects a video or 3D image input. Use --reference for image-generation references."
        );
      variant = inferred;
    }
    const selectedVariant =
      variant ??
      (kind === "three-d"
        ? (candidates.find((entry) => entry.variant === "text")?.variant ??
          candidates[0]!.variant)
        : "text");
    const selected = candidates.find(
      (entry) => entry.variant === selectedVariant
    );
    if (!selected) throw new MediaOperations.Failure("operation_unavailable");
    return operations.inspect(selector(selected));
  }

  /** Reconstruct the SDK's discriminated selection from its public descriptor. */
  export function selector(
    descriptor: MediaOperations.Descriptor
  ): MediaOperations.Selector {
    const {
      kind,
      model_id,
      provider_id: provider,
      variant,
      feature,
    } = descriptor;
    if (provider === "tripo") {
      if (
        kind !== "three-d" ||
        feature !== "model-generation" ||
        variant === "references"
      )
        throw new MediaOperations.Failure("operation_unavailable");
      return { kind, model_id, provider, feature, variant };
    }
    return { kind, model_id, provider, variant, feature };
  }

  export async function read(
    descriptor: MediaOperations.Descriptor,
    invocation: Generate,
    signal: AbortSignal,
    stdin: Readable
  ): Promise<unknown> {
    if (invocation.input !== undefined)
      return MediaFiles.readInput(invocation.input, signal, stdin);
    const request = invocation.request;
    const properties = object(descriptor.input_schema.properties);
    const value: Record<string, unknown> = Object.create(null);
    const claimed = new Set<string>();
    const claim = (field: string, flag: string): Schema => {
      if (!Object.hasOwn(properties, field))
        invalid(
          `${flag} is not supported by this operation. Run grida models inspect for its inputs.`
        );
      if (claimed.has(field))
        invalid(
          `The ${field} field was supplied more than once; choose one input source.`
        );
      claimed.add(field);
      return object(properties[field]);
    };
    // Validate syntax, supported fields and collisions before reading selected files.
    if (request.prompt !== undefined || request.promptFile !== undefined)
      claim("prompt", "--prompt/--prompt-file");
    if (request.text !== undefined || request.textFile !== undefined)
      claim("text", "--text/--text-file");
    if (request.voice !== undefined) claim("voice_id", "--voice");
    if (request.references) {
      const schema = claim("references", "--reference");
      if (schema.type !== "array")
        invalid("This operation does not accept a list of references.");
      if (
        typeof schema.maxItems === "number" &&
        request.references.length > schema.maxItems
      )
        invalid(
          `--reference accepts at most ${schema.maxItems} images for this operation.`
        );
    }
    let imageField: "image" | "image_url" | undefined;
    if (request.image !== undefined) {
      imageField = https(request.image) ? "image_url" : "image";
      claim(imageField, "--image in this file or URL form");
    }
    for (const parameter of request.parameters) {
      const schema = claim(parameter.field, "--param field");
      value[parameter.field] = scalar(parameter.value, schema, parameter.field);
    }
    if (request.prompt !== undefined) value.prompt = request.prompt;
    if (request.text !== undefined) value.text = request.text;
    if (request.voice !== undefined) value.voice_id = request.voice;

    let readBytes = 0;
    const budget = (bytes = 0) => {
      readBytes += bytes;
      if (
        readBytes > MediaFiles.inputLimits.text ||
        Buffer.byteLength(JSON.stringify(value)) > MediaFiles.inputLimits.text
      )
        invalid(
          "The assembled input exceeds 16 MiB, including encoded images. Use smaller files or supported HTTPS references."
        );
    };
    const text = async (source: string, flag: string) => {
      try {
        return await MediaFiles.readText(source, signal, stdin);
      } catch (error) {
        return fileFailure(error, flag);
      }
    };
    const image = async (source: string, flag: string) => {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(source) || source.startsWith("data:"))
        invalid(
          `${flag} requires a local image file or a supported HTTPS URL. Inline data belongs in --input JSON.`
        );
      try {
        const image = await MediaFiles.readImage(
          source,
          signal,
          MediaFiles.inputLimits.text - readBytes
        );
        budget(image.data.byteLength);
        return image;
      } catch (error) {
        return fileFailure(error, flag);
      }
    };
    budget();
    if (request.promptFile !== undefined)
      value.prompt = await text(request.promptFile, "--prompt-file");
    if (request.textFile !== undefined)
      value.text = await text(request.textFile, "--text-file");
    budget();
    if (request.references) {
      const references: string[] = [];
      value.references = references;
      for (const source of request.references) {
        if (https(source)) references.push(source);
        else {
          const asset = await image(source, "--reference");
          references.push(
            `data:${asset.media_type};base64,${Buffer.from(asset.data).toString("base64")}`
          );
        }
        budget();
      }
    }
    if (request.image !== undefined && imageField) {
      if (imageField === "image_url") value.image_url = request.image;
      else {
        const asset = await image(request.image, "--image");
        const fields = object(object(properties.image).properties);
        const maximum = object(fields.data)["x-grida-decoded-max-bytes"];
        if (typeof maximum === "number" && asset.data.byteLength > maximum)
          invalid(
            `--image exceeds this operation's decoded limit of ${maximum} bytes.`
          );
        const types = object(fields.media_type).enum;
        if (Array.isArray(types) && !types.includes(asset.media_type))
          invalid(
            "--image has a media type this operation does not accept. Run grida models inspect for accepted types."
          );
        value.image = {
          data: Buffer.from(asset.data).toString("base64"),
          media_type: asset.media_type,
        };
      }
    }
    budget();
    const required = descriptor.input_schema.required;
    if (Array.isArray(required)) {
      const missing = required.filter(
        (field): field is string =>
          typeof field === "string" && !Object.hasOwn(value, field)
      );
      if (missing.length)
        invalid(
          `Missing required input: ${missing.join(", ")}. Run grida models inspect for an example.`
        );
    }
    return value;
  }

  /** Human view of public schema facts; --json keeps the descriptor unchanged. */
  /** CLI file capabilities are a projection of the selected SDK schema, never a model list. */
  export function localImageFlags(
    descriptor: MediaOperations.Descriptor
  ): ("--reference" | "--image")[] {
    const properties = object(descriptor.input_schema.properties);
    const referenceItems = object(object(properties.references).items);
    const schemes = object(referenceItems["x-grida-url"]).schemes;
    const imageData = object(object(object(properties.image).properties).data);
    return [
      ...(Array.isArray(schemes) && schemes.includes("image-data")
        ? (["--reference"] as const)
        : []),
      ...(typeof imageData["x-grida-decoded-max-bytes"] === "number"
        ? (["--image"] as const)
        : []),
    ];
  }

  export function describe(descriptor: MediaOperations.Descriptor): string[] {
    const properties = object(descriptor.input_schema.properties);
    const localFlags = localImageFlags(descriptor);
    const required = new Set(
      Array.isArray(descriptor.input_schema.required)
        ? descriptor.input_schema.required
        : []
    );
    const lines = [
      `${descriptor.kind}: ${descriptor.provider_id} / ${descriptor.model_id} (${descriptor.variant})`,
      `Status: ${descriptor.status}`,
      "Inputs:",
    ];
    for (const [field, raw] of Object.entries(properties)) {
      const schema = object(raw);
      const details = [
        String(schema.type ?? "structured"),
        required.has(field) ? "required" : "optional",
      ];
      if (Array.isArray(schema.enum))
        details.push(
          `one of ${schema.enum.map((item) => JSON.stringify(item)).join(", ")}`
        );
      if (schema.default !== undefined)
        details.push(`default ${JSON.stringify(schema.default)}`);
      for (const key of [
        "minimum",
        "maximum",
        "minItems",
        "maxItems",
        "maxLength",
      ])
        if (typeof schema[key] === "number")
          details.push(`${key} ${schema[key]}`);
      if (field === "references")
        details.push(
          localFlags.includes("--reference")
            ? "--reference FILE or HTTPS-URL; repeat in order"
            : "--reference HTTPS-URL; repeat in order"
        );
      if (field === "image_url") details.push("--image HTTPS-URL");
      if (field === "image") {
        const nested = object(schema.properties);
        const maximum = object(nested.data)["x-grida-decoded-max-bytes"];
        const types = object(nested.media_type).enum;
        details.push("--image FILE");
        if (typeof maximum === "number")
          details.push(`decoded maximum ${maximum} bytes`);
        if (Array.isArray(types)) details.push(types.join(", "));
      }
      lines.push(`  ${field}: ${details.join("; ")}`);
    }
    if (properties.image && properties.image_url)
      lines.push("Supply exactly one image file or HTTPS URL.");
    const example = [
      "grida generate",
      "--provider",
      quote(descriptor.provider_id),
      "--model",
      quote(descriptor.model_id),
    ];
    if (descriptor.variant !== "text")
      example.push("--variant", quote(descriptor.variant));
    if (descriptor.variant === "multiview")
      example.push("--input", "@input.json");
    else if (properties.prompt)
      example.push("--prompt", quote("Describe what to generate"));
    if (properties.text) example.push("--text", quote("Hello from Grida"));
    if (properties.voice_id) example.push("--voice", quote("YOUR_VOICE_ID"));
    if (properties.references)
      example.push(
        "--reference",
        localFlags.includes("--reference")
          ? "./reference.png"
          : quote("https://example.com/reference.png")
      );
    if (properties.image) example.push("--image", "./input.png");
    else if (properties.image_url)
      example.push("--image", quote("https://example.com/input.png"));
    example.push("--out", "./result");
    return [
      ...lines,
      "",
      "Example:",
      `  ${example.join(" ")}`,
      "",
      "--param FIELD=VALUE sets an advertised scalar input. Use --input @file|- for complex JSON.",
      ...(descriptor.variant === "multiview"
        ? [
            "Multiview inputs use --input JSON with inline image data; JSON strings do not grant local file reads.",
          ]
        : []),
      ...(localFlags.length
        ? [
            "Local images: PNG/JPEG/static WebP, at most 8 MiB each (operation limits may be lower).",
            "Total assembled input: 16 MiB including base64. Paths are relative to the working directory.",
          ]
        : [
            "This operation does not accept local image files.",
            "Total assembled input: 16 MiB.",
          ]),
    ];
  }

  function scalar(
    value: string,
    schema: Schema,
    field: string
  ): string | number | boolean {
    if (schema.type === "string") return value;
    if (schema.type === "number" || schema.type === "integer") {
      if (
        /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value) &&
        Number.isFinite(Number(value))
      )
        return Number(value);
    } else if (schema.type === "boolean") {
      if (value === "true") return true;
      if (value === "false") return false;
    } else
      invalid(
        `The ${field} field needs structured input; use --input @file|- and the model schema.`
      );
    return invalid(
      `The ${field} field needs a ${String(schema.type)} value. Run grida models inspect for its schema.`
    );
  }
  function object(value: unknown): Schema {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Schema)
      : {};
  }
  function https(value: string): boolean {
    return /^https:\/\//i.test(value);
  }
  function quote(value: string): string {
    return `'${value.replaceAll("'", "'\\''")}'`;
  }
  function invalid(message: string): never {
    throw new Cli.Failure("invalid_usage", message);
  }
  function fileFailure(error: unknown, flag: string): never {
    if (!(error instanceof MediaFiles.Failure) || error.code === "cancelled")
      throw error;
    return invalid(
      `${flag}: cannot read this input. Use a readable regular file of the documented type and size; text must be UTF-8.`
    );
  }
}
