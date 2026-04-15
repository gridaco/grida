"use client";

import { useCallback, useEffect, useState } from "react";
import type { Content } from "@tiptap/react";
import { MinimalTiptapEditor, toTiptapContent } from "@/kits/minimal-tiptap";
import { Skeleton } from "@/components/ui/skeleton";
import type { FileResolverFn, FileUploaderFn } from "../file-upload-field";
import { RichTextStagedFileUtils } from "@/services/form";

type FileHandler =
  | {
      uploader?: FileUploaderFn;
      resolver?: FileResolverFn;
    }
  | {
      uploader: FileUploaderFn;
      resolver: FileResolverFn;
    };

/**
 * Compute the hidden-input string form of a Content value, always passing
 * object content through {@link RichTextStagedFileUtils.restageDocument} so
 * image srcs with a staged-path marker in their `id` attr are rewritten back
 * to `grida-tmp://…` form. This keeps the form-submission payload consistent
 * with what the server expects regardless of whether the editor has fired
 * `onUpdate` yet (covers initial mount, resolver success, resolver failure,
 * and post-update handleChange calls uniformly).
 */
const computeSerialized = (value: Content | undefined): string => {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(
    RichTextStagedFileUtils.restageDocument(value as object)
  );
};

const noop = () => {};

/**
 * Result of resolving `grida-tmp://` staged URLs in the initial content.
 * `pending` is the pre-resolution state; the editor renders a skeleton until
 * this becomes a concrete `Content | undefined`.
 */
type InitialValueState =
  | { status: "pending" }
  | { status: "ready"; value: Content | undefined };

export function RichTextEditorField({
  name,
  required,
  placeholder,
  initialContent,
  onContentChange,
  uploader,
  resolver,
}: {
  name?: string;
  required?: boolean;
  placeholder?: string;
  initialContent?: unknown;
  onContentChange?: (serialized: string) => void;
} & FileHandler) {
  // `initialContent` and `resolver` are contractually fixed at mount; the
  // effect below transitions `initial.status` exactly once, so referring to
  // the props directly (rather than snapshotting into refs) is safe.
  const [initial, setInitial] = useState<InitialValueState>(() => {
    const raw = toTiptapContent(initialContent);
    // No staged-url resolution needed unless a resolver is provided and the
    // initial content could contain tmp URLs. Resolver-less mount is sync.
    if (!resolver || raw == null) return { status: "ready", value: raw };
    return { status: "pending" };
  });
  const [serialized, setSerialized] = useState<string>(() => {
    if (initial.status === "ready") return computeSerialized(initial.value);
    return "";
  });

  // Resolve staged grida-tmp URLs in initialContent before mounting the
  // editor. Synchronous resolver-less path exits via the lazy useState init
  // above; this effect only runs when `initial.status === "pending"`.
  useEffect(() => {
    if (initial.status !== "pending") return;
    let cancelled = false;
    (async () => {
      const raw = toTiptapContent(initialContent);
      if (!resolver || raw == null || typeof raw !== "object") {
        if (!cancelled) {
          setInitial({ status: "ready", value: raw });
          setSerialized(computeSerialized(raw));
        }
        return;
      }
      try {
        const resolved = (await RichTextStagedFileUtils.resolveDocument(
          raw as object,
          resolver
        )) as Content;
        if (cancelled) return;
        setInitial({ status: "ready", value: resolved });
        // computeSerialized restages the resolved value back to grida-tmp
        // via the staged-id marker, so an unedited submit still carries a
        // commit-eligible payload.
        setSerialized(computeSerialized(resolved));
      } catch {
        if (cancelled) return;
        // Fall through with unresolved content — broken <img> is better
        // than a blocked form.
        setInitial({ status: "ready", value: raw });
        setSerialized(computeSerialized(raw));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.status]);

  const wrappedUploader = useCallback(
    async (file: File): Promise<{ src: string; id: string }> => {
      const result = await uploader!(file);
      // FileUploaderFn types both `path` and `fullPath` as optional. Prefer
      // `path` (the bucket-relative key used by the resolver/render pipeline)
      // and fall back to `fullPath` so uploaders that only produce the latter
      // still yield a working staged URL instead of `grida-tmp://undefined`.
      const uploadPath = result.path ?? result.fullPath;
      if (!uploadPath) {
        throw new Error(
          "richtext uploader returned neither `path` nor `fullPath`"
        );
      }

      // Obtain a browser-fetchable URL for the freshly-uploaded file so the
      // editor can actually render the <img> during composition. Without a
      // resolver we fall back to the grida-tmp URL — the image will show
      // broken, but the submission path still works end-to-end (matching
      // BlockNote's behavior on forms without a file-resolver strategy).
      let displaySrc: string;
      if (resolver) {
        try {
          const resolved = await resolver({ path: uploadPath });
          displaySrc =
            resolved?.publicUrl ??
            RichTextStagedFileUtils.encodeTmpUrl(uploadPath);
        } catch {
          displaySrc = RichTextStagedFileUtils.encodeTmpUrl(uploadPath);
        }
      } else {
        displaySrc = RichTextStagedFileUtils.encodeTmpUrl(uploadPath);
      }

      // The staged path rides along on the node's `id` attr so restage is
      // stateless across draft saves and reloads. See STAGED_PATH_ID_PREFIX.
      return {
        src: displaySrc,
        id: RichTextStagedFileUtils.encodeStagedIdAttr(uploadPath),
      };
    },
    [uploader, resolver]
  );

  const handleChange = useCallback(
    (content: Content) => {
      // computeSerialized handles the restage walk + string fallthrough so
      // hidden input + onContentChange always see the submission form.
      const next = computeSerialized(content);
      setSerialized(next);
      onContentChange?.(next);
    },
    [onContentChange]
  );

  return (
    <div className="shadow-sm h-full w-full rounded-md border border-input bg-transparent text-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 overflow-hidden">
      {initial.status === "pending" ? (
        <Skeleton className="min-h-[120px] w-full" />
      ) : (
        <MinimalTiptapEditor
          value={initial.value}
          onChange={handleChange}
          className="w-full border-0 shadow-none rounded-none"
          editorContentClassName="px-5 py-10 w-full"
          output="json"
          placeholder={placeholder}
          immediatelyRender={false}
          uploader={uploader ? wrappedUploader : undefined}
          editorClassName="focus:outline-none prose dark:prose-invert max-w-none min-h-[120px]"
        />
      )}
      {/*
        The sr-only input carries the serialized richtext value into the
        native form submission and gates required-field validation.
        It must NOT be `readOnly` — HTML spec bars readonly inputs from
        constraint validation, which would silently disable `required`.
        The no-op onChange satisfies React's controlled-input contract.
       */}
      <input
        type="text"
        name={name}
        value={serialized}
        onChange={noop}
        required={required}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
