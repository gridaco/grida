const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BINARY_CHUNK = 0x004e4942;

type JsonObject = Record<string, unknown>;

type GltfBuffer = JsonObject & {
  uri?: unknown;
  byteLength?: unknown;
};

type GltfBufferView = JsonObject & {
  buffer?: unknown;
  byteOffset?: unknown;
  byteLength?: unknown;
};

type GltfImage = JsonObject & {
  uri?: unknown;
  bufferView?: unknown;
  mimeType?: unknown;
};

type GltfDocument = JsonObject & {
  asset?: unknown;
  buffers?: unknown;
  bufferViews?: unknown;
  extensionsRequired?: unknown;
  images?: unknown;
};

const SUPPORTED_REQUIRED_EXTENSIONS = [
  "KHR_lights_punctual",
  "KHR_materials_anisotropy",
  "KHR_materials_clearcoat",
  "KHR_materials_dispersion",
  "KHR_materials_emissive_strength",
  "KHR_materials_ior",
  "KHR_materials_iridescence",
  "KHR_materials_sheen",
  "KHR_materials_specular",
  "KHR_materials_transmission",
  "KHR_materials_unlit",
  "KHR_materials_volume",
  "KHR_mesh_quantization",
  "KHR_texture_transform",
  "EXT_materials_bump",
  "EXT_mesh_gpu_instancing",
  "EXT_texture_avif",
  "EXT_texture_webp",
] as const;

const SUPPORTED_REQUIRED_EXTENSION_SET = new Set<string>(
  SUPPORTED_REQUIRED_EXTENSIONS
);

type ParsedGlb = Readonly<{
  document: GltfDocument;
  binary: Uint8Array | null;
  hasUnknownChunks: boolean;
}>;

type Resource = Readonly<{
  key: string;
  bytes: Uint8Array;
  mimeType: string | null;
}>;

/**
 * A bounded, renderer-local glTF bundle.
 *
 * The bundle never lets Three fetch a selected URI. JSON glTF resources are
 * resolved against the selected files, validated, and folded into an in-memory
 * GLB before parsing. This keeps the Desktop renderer's `connect-src` boundary
 * intact and gives GLB the stable, self-contained path.
 */
export class LocalGltfBundle {
  static readonly ACCEPT = ".glb,.gltf,model/gltf-binary,model/gltf+json";

  static readonly SUPPORTED_FORMATS = [
    {
      extension: ".glb",
      format: "glb",
      stability: "stable",
      label: "glTF Binary",
    },
    {
      extension: ".gltf",
      format: "gltf",
      stability: "experimental",
      label: "glTF JSON bundle",
    },
  ] as const satisfies readonly LocalGltfBundle.FormatSupport[];

  static readonly LIMITS = Object.freeze({
    maxFiles: 512,
    maxInputBytes: 256 * 1024 * 1024,
    maxPreparedBytes: 256 * 1024 * 1024,
  });

  /** Required extensions supported without optional decoders or workers. */
  static readonly SUPPORTED_REQUIRED_EXTENSIONS = Object.freeze(
    SUPPORTED_REQUIRED_EXTENSIONS
  );

  static open(files: readonly File[]): LocalGltfBundle {
    if (files.length === 0) {
      throw new Error("Choose one .glb or .gltf asset.");
    }
    if (files.length > LocalGltfBundle.LIMITS.maxFiles) {
      throw new Error(
        `A local glTF bundle can contain at most ${LocalGltfBundle.LIMITS.maxFiles} files.`
      );
    }

    const byPath = new Map<string, File>();
    let totalBytes = 0;
    for (const file of files) {
      totalBytes += file.size;
      if (
        !Number.isSafeInteger(totalBytes) ||
        totalBytes > LocalGltfBundle.LIMITS.maxInputBytes
      ) {
        throw new Error("The selected glTF bundle exceeds the 256 MiB limit.");
      }

      const path = normalizeSelectedFilePath(
        file.webkitRelativePath || file.name
      );
      if (byPath.has(path)) {
        throw new Error(
          `The selected glTF bundle contains duplicate path "${path}".`
        );
      }
      byPath.set(path, file);
    }

    const entries = [...byPath.entries()].filter(([path]) =>
      /\.(?:glb|gltf)$/i.test(path)
    );
    if (entries.length !== 1) {
      throw new Error(
        entries.length === 0
          ? "The selected bundle does not contain a .glb or .gltf entry."
          : "Choose a bundle containing exactly one .glb or .gltf entry."
      );
    }

    const [virtualPath, file] = entries[0];
    const format: LocalGltfBundle.Format = /\.glb$/i.test(virtualPath)
      ? "glb"
      : "gltf";
    return new LocalGltfBundle(
      byPath,
      Object.freeze({
        file,
        virtualPath,
        format,
        stability: format === "glb" ? "stable" : "experimental",
      })
    );
  }

  readonly entry: LocalGltfBundle.Entry;

  private constructor(
    private readonly filesByPath: ReadonlyMap<string, File>,
    entry: LocalGltfBundle.Entry
  ) {
    this.entry = entry;
  }

  /** Resolve a relative glTF URI to one of the explicitly selected files. */
  resolve(uri: string): File {
    const path = this.resolvePath(uri);
    return this.findLocalResource(path).file;
  }

  /** Read the entry as a self-contained GLB suitable for GLTFLoader.parseAsync. */
  async read(): Promise<ArrayBuffer> {
    const bytes = new Uint8Array(await this.entry.file.arrayBuffer());
    if (this.entry.format === "gltf") {
      const document = decodeJsonDocument(bytes, this.entry.virtualPath);
      return this.pack(document, null);
    }

    const parsed = parseGlb(bytes);
    validateGltf2(parsed.document);
    const external = documentHasExternalResources(parsed.document);
    if (!external) return exactArrayBuffer(bytes);
    if (parsed.hasUnknownChunks) {
      throw new Error(
        "This GLB uses extra binary chunks and external resources, so it cannot be prepared safely."
      );
    }
    return this.pack(parsed.document, parsed.binary);
  }

  private resolvePath(uri: string): string {
    const segments = normalizeResourceUri(uri);
    const entryDirectory = this.entry.virtualPath.split("/").slice(0, -1);
    return [...entryDirectory, ...segments].join("/");
  }

  private async readResource(uri: string): Promise<Resource> {
    if (uri.startsWith("data:")) {
      const data = decodeDataUri(uri);
      return {
        key: uri,
        bytes: data.bytes,
        mimeType: data.mimeType,
      };
    }

    const path = this.resolvePath(uri);
    const resource = this.findLocalResource(path);
    return {
      key: `file:${resource.virtualPath}`,
      bytes: new Uint8Array(await resource.file.arrayBuffer()),
      mimeType: resource.file.type || null,
    };
  }

  /**
   * Normal multi-file pickers do not retain directory paths. When the exact
   * glTF URI is absent, accept a selected sidecar by basename only when that
   * basename is unique; ambiguous flattening fails closed.
   */
  private findLocalResource(path: string): Readonly<{
    virtualPath: string;
    file: File;
  }> {
    const exact = this.filesByPath.get(path);
    if (exact) return { virtualPath: path, file: exact };

    const basename = path.split("/").at(-1);
    const candidates = [...this.filesByPath.entries()].filter(
      ([candidate]) => candidate.split("/").at(-1) === basename
    );
    if (candidates.length === 1) {
      const [virtualPath, file] = candidates[0];
      return { virtualPath, file };
    }
    if (candidates.length > 1) {
      throw new Error(
        `The glTF resource "${path}" is ambiguous after directory paths were flattened.`
      );
    }
    throw new Error(`The glTF bundle is missing local resource "${path}".`);
  }

  private async pack(
    document: GltfDocument,
    embeddedBinary: Uint8Array | null
  ): Promise<ArrayBuffer> {
    validateGltf2(document);

    const buffers = optionalObjectArray<GltfBuffer>(
      document.buffers,
      "buffers"
    );
    const bufferViews = optionalObjectArray<GltfBufferView>(
      document.bufferViews,
      "bufferViews"
    );
    const images = optionalObjectArray<GltfImage>(document.images, "images");
    const chunks: Uint8Array[] = [];
    const appended = new Map<
      string,
      Readonly<{ offset: number; length: number }>
    >();
    const bufferOffsets: number[] = [];
    let binaryLength = 0;

    const append = (
      resource: Resource
    ): Readonly<{
      offset: number;
      length: number;
    }> => {
      const previous = appended.get(resource.key);
      if (previous) return previous;

      const alignedOffset = align4(binaryLength);
      if (alignedOffset > binaryLength) {
        chunks.push(new Uint8Array(alignedOffset - binaryLength));
      }
      const nextLength = alignedOffset + resource.bytes.byteLength;
      if (nextLength > LocalGltfBundle.LIMITS.maxPreparedBytes) {
        throw new Error("The prepared glTF asset exceeds the 256 MiB limit.");
      }
      chunks.push(resource.bytes);
      binaryLength = nextLength;
      const location = Object.freeze({
        offset: alignedOffset,
        length: resource.bytes.byteLength,
      });
      appended.set(resource.key, location);
      return location;
    };

    for (const [index, buffer] of buffers.entries()) {
      const declaredLength = requiredNonNegativeInteger(
        buffer.byteLength,
        `buffers[${index}].byteLength`
      );
      let resource: Resource;
      if (buffer.uri === undefined) {
        if (index !== 0 || !embeddedBinary) {
          throw new Error(
            `buffers[${index}] has no URI outside a matching GLB binary chunk.`
          );
        }
        resource = {
          key: "glb:binary",
          bytes: embeddedBinary,
          mimeType: "application/octet-stream",
        };
      } else {
        if (typeof buffer.uri !== "string") {
          throw new Error(`buffers[${index}].uri must be a string.`);
        }
        resource = await this.readResource(buffer.uri);
      }
      if (resource.bytes.byteLength < declaredLength) {
        throw new Error(
          `buffers[${index}] declares ${declaredLength} bytes, but its resource contains ${resource.bytes.byteLength}.`
        );
      }
      bufferOffsets[index] = append(resource).offset;
    }

    for (const [index, view] of bufferViews.entries()) {
      const sourceBuffer = requiredNonNegativeInteger(
        view.buffer,
        `bufferViews[${index}].buffer`
      );
      const baseOffset = bufferOffsets[sourceBuffer];
      if (baseOffset === undefined) {
        throw new Error(
          `bufferViews[${index}] refers to missing buffer ${sourceBuffer}.`
        );
      }
      const byteOffset = optionalNonNegativeInteger(
        view.byteOffset,
        `bufferViews[${index}].byteOffset`
      );
      view.buffer = 0;
      view.byteOffset = baseOffset + byteOffset;
    }

    for (const [index, image] of images.entries()) {
      if (image.uri === undefined) continue;
      if (typeof image.uri !== "string") {
        throw new Error(`images[${index}].uri must be a string.`);
      }
      const resource = await this.readResource(image.uri);
      const mimeType = supportedImageMimeType(
        image.mimeType,
        resource.mimeType,
        image.uri
      );
      const location = append(resource);
      image.bufferView = bufferViews.length;
      image.mimeType = mimeType;
      delete image.uri;
      bufferViews.push({
        buffer: 0,
        byteOffset: location.offset,
        byteLength: location.length,
      });
    }

    if (binaryLength > 0) {
      const alignedLength = align4(binaryLength);
      if (alignedLength > LocalGltfBundle.LIMITS.maxPreparedBytes) {
        throw new Error("The prepared glTF asset exceeds the 256 MiB limit.");
      }
      if (alignedLength > binaryLength) {
        chunks.push(new Uint8Array(alignedLength - binaryLength));
        binaryLength = alignedLength;
      }
      const binary = new Uint8Array(binaryLength);
      let offset = 0;
      for (const chunk of chunks) {
        binary.set(chunk, offset);
        offset += chunk.byteLength;
      }
      document.buffers = [{ byteLength: binaryLength }];
      document.bufferViews = bufferViews;
      return encodeGlb(document, binary);
    }

    delete document.buffers;
    if (bufferViews.length === 0) delete document.bufferViews;
    return encodeGlb(document, null);
  }
}

export namespace LocalGltfBundle {
  export type Format = "glb" | "gltf";
  export type Stability = "stable" | "experimental";

  export type FormatSupport = Readonly<{
    extension: ".glb" | ".gltf";
    format: Format;
    stability: Stability;
    label: string;
  }>;

  export type Entry = Readonly<{
    file: File;
    virtualPath: string;
    format: Format;
    stability: Stability;
  }>;
}

function normalizeSelectedFilePath(path: string): string {
  if (!path || path.startsWith("/") || path.includes("\\")) {
    throw new Error(`Unsafe selected file path "${path}".`);
  }
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\0")
    )
  ) {
    throw new Error(`Unsafe selected file path "${path}".`);
  }
  return segments.join("/");
}

function normalizeResourceUri(uri: string): readonly string[] {
  if (!uri || uri.startsWith("//") || uri.includes("?") || uri.includes("#")) {
    throw new Error(`Unsafe glTF resource URI "${uri}".`);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(uri)) {
    throw new Error(
      `Network and external glTF resource URI "${uri}" is not allowed.`
    );
  }
  if (uri.startsWith("/") || uri.includes("\\")) {
    throw new Error(`Unsafe glTF resource URI "${uri}".`);
  }

  const output: string[] = [];
  for (const encodedSegment of uri.split("/")) {
    if (!encodedSegment || encodedSegment === ".") continue;
    let segment: string;
    try {
      segment = decodeURIComponent(encodedSegment);
    } catch {
      throw new Error(`Malformed glTF resource URI "${uri}".`);
    }
    if (
      segment === ".." ||
      segment.includes("/") ||
      segment.includes("\\") ||
      segment.includes("\0")
    ) {
      throw new Error(
        `Parent traversal in glTF resource URI "${uri}" is not allowed.`
      );
    }
    output.push(segment);
  }
  if (output.length === 0) {
    throw new Error(`Unsafe glTF resource URI "${uri}".`);
  }
  return output;
}

function decodeJsonDocument(bytes: Uint8Array, name: string): GltfDocument {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`The glTF entry "${name}" is not valid UTF-8 JSON.`);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!isJsonObject(value)) throw new Error();
    return value;
  } catch {
    throw new Error(`The glTF entry "${name}" is not valid JSON.`);
  }
}

function validateGltf2(document: GltfDocument): void {
  if (!isJsonObject(document.asset) || document.asset.version !== "2.0") {
    throw new Error("Only glTF 2.0 assets are supported.");
  }
  if (document.extensionsRequired === undefined) return;
  if (
    !Array.isArray(document.extensionsRequired) ||
    !document.extensionsRequired.every(
      (extension): extension is string => typeof extension === "string"
    )
  ) {
    throw new Error("glTF extensionsRequired must be an array of strings.");
  }
  const unsupported = document.extensionsRequired.filter(
    (extension) => !SUPPORTED_REQUIRED_EXTENSION_SET.has(extension)
  );
  if (unsupported.length > 0) {
    throw new Error(
      `Required glTF ${unsupported.length === 1 ? "extension" : "extensions"} not enabled: ${unsupported.join(", ")}.`
    );
  }
}

function documentHasExternalResources(document: GltfDocument): boolean {
  const buffers = optionalObjectArray<GltfBuffer>(document.buffers, "buffers");
  const images = optionalObjectArray<GltfImage>(document.images, "images");
  let external = false;
  for (const [index, buffer] of buffers.entries()) {
    if (buffer.uri === undefined) continue;
    if (typeof buffer.uri !== "string") {
      throw new Error(`buffers[${index}].uri must be a string.`);
    }
    if (buffer.uri.startsWith("data:")) {
      external = true;
      continue;
    }
    normalizeResourceUri(buffer.uri);
    external = true;
  }
  for (const [index, image] of images.entries()) {
    if (image.uri === undefined) continue;
    if (typeof image.uri !== "string") {
      throw new Error(`images[${index}].uri must be a string.`);
    }
    if (image.uri.startsWith("data:")) continue;
    normalizeResourceUri(image.uri);
    external = true;
  }
  return external;
}

function parseGlb(bytes: Uint8Array): ParsedGlb {
  if (bytes.byteLength < 20) throw new Error("The GLB header is incomplete.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error("The selected .glb file has an invalid magic header.");
  }
  if (view.getUint32(4, true) !== GLB_VERSION) {
    throw new Error("Only GLB version 2 is supported.");
  }
  if (view.getUint32(8, true) !== bytes.byteLength) {
    throw new Error(
      "The GLB declared length does not match the selected file."
    );
  }

  let offset = 12;
  let json: Uint8Array | null = null;
  let binary: Uint8Array | null = null;
  let hasUnknownChunks = false;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength)
      throw new Error("The GLB chunk header is incomplete.");
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    offset += 8;
    if (chunkLength % 4 !== 0 || offset + chunkLength > bytes.byteLength) {
      throw new Error("The GLB contains an invalid chunk length.");
    }
    const chunk = bytes.subarray(offset, offset + chunkLength);
    offset += chunkLength;
    if (chunkType === GLB_JSON_CHUNK && json === null) json = chunk;
    else if (chunkType === GLB_BINARY_CHUNK && binary === null) binary = chunk;
    else hasUnknownChunks = true;
  }
  if (!json) throw new Error("The GLB does not contain a JSON chunk.");
  const document = decodeJsonDocument(
    new TextEncoder().encode(
      new TextDecoder("utf-8", { fatal: true }).decode(json).trimEnd()
    ),
    "GLB JSON chunk"
  );
  return { document, binary, hasUnknownChunks };
}

function encodeGlb(
  document: GltfDocument,
  binary: Uint8Array | null
): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(document));
  const jsonLength = align4(json.byteLength);
  const binaryLength = binary?.byteLength ?? 0;
  const totalLength = 12 + 8 + jsonLength + (binary ? 8 + binaryLength : 0);
  if (totalLength > LocalGltfBundle.LIMITS.maxPreparedBytes + 1024 * 1024) {
    throw new Error("The prepared GLB exceeds the output limit.");
  }

  const output = new Uint8Array(totalLength);
  const view = new DataView(output.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, GLB_JSON_CHUNK, true);
  output.fill(0x20, 20, 20 + jsonLength);
  output.set(json, 20);
  if (binary) {
    const binaryHeader = 20 + jsonLength;
    view.setUint32(binaryHeader, binaryLength, true);
    view.setUint32(binaryHeader + 4, GLB_BINARY_CHUNK, true);
    output.set(binary, binaryHeader + 8);
  }
  return output.buffer;
}

function decodeDataUri(uri: string): Readonly<{
  bytes: Uint8Array;
  mimeType: string | null;
}> {
  const comma = uri.indexOf(",");
  if (comma < 5) throw new Error("Malformed glTF data URI.");
  const metadata = uri.slice(5, comma);
  const payload = uri.slice(comma + 1);
  const parts = metadata.split(";");
  const mimeType = parts[0] || null;
  const base64 = parts.includes("base64");
  let bytes: Uint8Array;
  if (base64) {
    if (payload.length > LocalGltfBundle.LIMITS.maxPreparedBytes * 2) {
      throw new Error("The glTF data URI exceeds the prepared asset limit.");
    }
    let decoded: string;
    try {
      decoded = atob(payload);
    } catch {
      throw new Error("Malformed base64 glTF data URI.");
    }
    bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  } else {
    const output: number[] = [];
    for (let index = 0; index < payload.length; index += 1) {
      const character = payload[index];
      if (character === "%") {
        const encoded = payload.slice(index + 1, index + 3);
        if (!/^[\da-f]{2}$/i.test(encoded)) {
          throw new Error("Malformed percent-encoded glTF data URI.");
        }
        output.push(Number.parseInt(encoded, 16));
        index += 2;
      } else {
        const code = character.charCodeAt(0);
        if (code > 0x7f) throw new Error("Malformed non-ASCII glTF data URI.");
        output.push(code);
      }
      if (output.length > LocalGltfBundle.LIMITS.maxPreparedBytes) {
        throw new Error("The glTF data URI exceeds the prepared asset limit.");
      }
    }
    bytes = Uint8Array.from(output);
  }
  return { bytes, mimeType };
}

function supportedImageMimeType(
  declared: unknown,
  selectedFileType: string | null,
  uri: string
): string {
  const candidates = [
    typeof declared === "string" ? declared.toLowerCase() : null,
    selectedFileType?.toLowerCase() ?? null,
    imageMimeFromPath(uri),
  ];
  const supported = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/avif",
  ]);
  const mimeType = candidates.find(
    (candidate): candidate is string =>
      candidate !== null && supported.has(candidate)
  );
  if (!mimeType) {
    throw new Error(
      `Image resource "${uri}" must be PNG, JPEG, WebP, or AVIF. Compressed KTX2 textures are not enabled.`
    );
  }
  return mimeType;
}

function imageMimeFromPath(uri: string): string | null {
  const path = uri.startsWith("data:") ? "" : uri.toLowerCase();
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".avif")) return "image/avif";
  return null;
}

function optionalObjectArray<T extends JsonObject>(
  value: unknown,
  name: string
): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every(isJsonObject)) {
    throw new Error(`glTF ${name} must be an array of objects.`);
  }
  return value as T[];
}

function requiredNonNegativeInteger(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return value as number;
}

function optionalNonNegativeInteger(value: unknown, name: string): number {
  return value === undefined ? 0 : requiredNonNegativeInteger(value, name);
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function align4(value: number): number {
  return (value + 3) & ~3;
}

function exactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer;
}
