// GRIDA-SEC-004 — Main assigns and revokes the exact tool source authority.
import { randomUUID } from "node:crypto";
import { NativeDesktopTools } from "./native-desktop-tools";

const MAX_SOURCES = 16;
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;
const SOURCE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type DesktopToolSource = Readonly<{
  id: string;
  description: string;
  tools: readonly NativeDesktopTools.Tool[];
}>;

type Source<Scope> = {
  identity: NativeDesktopTools.Source;
  lifetime: AbortController;
  bind(scope: Scope): readonly NativeDesktopTools.Tool[];
};

/** Private to one admitted chat attachment and its Main-owned producers. */
export class NativeDesktopToolSources<Scope> {
  private readonly sources = new Map<string, Source<Scope>>();

  register({ id, description, tools }: DesktopToolSource): { close(): void } {
    const named = tools.map((tool) => {
      const name = `desktop_${id.replaceAll("-", "_")}__${tool.definition.name}`;
      return {
        ...tool,
        ...(tool.transfer && { transfer: { ...tool.transfer } }),
        definition: { ...structuredClone(tool.definition), name },
      };
    });
    if (!named.length || !validTools(named))
      throw new Error("native_desktop_tool_source_invalid");
    return this.registerBuiltin(id, description, () => named);
  }

  registerBuiltin(
    id: string,
    description: string,
    bind: Source<Scope>["bind"]
  ): { close(): void } {
    if (
      !SOURCE_ID.test(id) ||
      id.length > 64 ||
      !description.trim() ||
      Buffer.byteLength(description) > 160 ||
      /[\p{Cc}\p{Zl}\p{Zp}]/u.test(description) ||
      this.sources.has(id) ||
      this.sources.size >= MAX_SOURCES
    )
      throw new Error("native_desktop_tool_source_invalid");
    const source = {
      identity: Object.freeze({ id, generation: randomUUID(), description }),
      lifetime: new AbortController(),
      bind,
    };
    this.sources.set(id, source);
    return {
      close: () => {
        if (this.sources.get(id) !== source) return;
        this.sources.delete(id);
        source.lifetime.abort();
      },
    };
  }

  current(binding: NativeDesktopTools.SourceBinding): boolean {
    return (
      this.sources.get(binding.id)?.identity.generation === binding.generation
    );
  }

  tools(scope: Scope, binding?: NativeDesktopTools.SourceBinding) {
    const tools: NativeDesktopTools.RegisteredTool[] = [];
    const names = new Set<string>();
    for (const { identity, lifetime, bind } of this.sources.values()) {
      if (binding && binding.id !== identity.id) continue;
      const bound = bind(scope);
      if (
        !validTools(bound) ||
        bound.some(({ definition }) => names.has(definition.name))
      )
        throw new Error("native_desktop_tool_catalog_invalid");
      for (const tool of bound) {
        names.add(tool.definition.name);
        tools.push({
          ...tool,
          source: identity,
          sourceSignal: lifetime.signal,
        });
      }
    }
    return tools;
  }

  close(): void {
    const retired = [...this.sources.values()];
    this.sources.clear();
    for (const { lifetime } of retired) lifetime.abort();
  }
}

function validTools(tools: readonly NativeDesktopTools.Tool[]): boolean {
  const names = tools.map(({ definition }) => definition.name);
  return (
    names.length <= NativeDesktopTools.maxTools &&
    names.every((name) => TOOL_NAME.test(name)) &&
    new Set(names).size === names.length &&
    tools.every(
      ({ definition, revision, transfer, resultDisposition }) =>
        Number.isSafeInteger(revision) &&
        revision > 0 &&
        revision <= 0xffffffff &&
        definition.description.length > 0 &&
        Buffer.byteLength(definition.description) <= 2048 &&
        (!transfer ||
          (Number.isSafeInteger(transfer.maxInputBytes) &&
            transfer.maxInputBytes > 0 &&
            transfer.maxInputBytes <= NativeDesktopTools.maxInputBytes &&
            Number.isSafeInteger(transfer.maxOutputBytes) &&
            transfer.maxOutputBytes > 0 &&
            transfer.maxOutputBytes <= NativeDesktopTools.maxOutputBytes &&
            (transfer.resultMimeType === undefined ||
              (definition.annotations?.readOnlyHint === true &&
                transfer.resultMimeType === "image/jpeg" &&
                resultDisposition === true))))
    )
  );
}
