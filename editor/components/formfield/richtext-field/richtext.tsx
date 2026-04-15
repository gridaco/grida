"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

const serialize = (content: Content): string =>
  typeof content === "string" ? content : JSON.stringify(content);

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
  const [initial, setInitial] = useState<InitialValueState>(() => {
    const raw = toTiptapContent(initialContent);
    // No staged-url resolution needed unless a resolver is provided and the
    // initial content could contain tmp URLs. Resolver-less mount is sync.
    if (!resolver || raw == null) return { status: "ready", value: raw };
    return { status: "pending" };
  });
  const [serialized, setSerialized] = useState<string>(() => {
    if (initial.status === "ready" && initial.value != null)
      return serialize(initial.value);
    return "";
  });

  // Resolve staged grida-tmp URLs in initialContent before mounting the editor.
  // This only runs when a resolver is provided; otherwise initial state starts
  // as `ready` synchronously (see above) and this effect is a no-op.
  useEffect(() => {
    if (initial.status !== "pending") return;
    let cancelled = false;
    (async () => {
      const raw = toTiptapContent(initialContent);
      if (!resolver || raw == null || typeof raw !== "object") {
        if (!cancelled) setInitial({ status: "ready", value: raw });
        return;
      }
      try {
        const resolved = await RichTextStagedFileUtils.resolveDocument(
          raw as object,
          resolver
        );
        if (cancelled) return;
        const value = resolved as Content;
        setInitial({ status: "ready", value });
        setSerialized(serialize(value));
      } catch {
        if (cancelled) return;
        // On resolver failure, fall through with the unresolved content —
        // broken images are better than a blocked form.
        setInitial({ status: "ready", value: raw });
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only runs on the initial mount; resolver / initialContent are not
    // supported to change after mount for this field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tracks `displayUrl → stagedPath` for every file uploaded in this session.
  // Populated by wrappedUploader after a successful upload + resolve, consumed
  // by handleChange to rewrite those display URLs back to grida-tmp form on
  // serialize so the server's submit pipeline can find and commit them.
  const stagedPathByUrl = useRef(new Map<string, string>());

  const wrappedUploader = useCallback(
    async (file: File): Promise<string> => {
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
      let displayUrl: string;
      if (resolver) {
        try {
          const resolved = await resolver({ path: uploadPath });
          displayUrl =
            resolved?.publicUrl ??
            RichTextStagedFileUtils.encodeTmpUrl(uploadPath);
        } catch {
          displayUrl = RichTextStagedFileUtils.encodeTmpUrl(uploadPath);
        }
      } else {
        displayUrl = RichTextStagedFileUtils.encodeTmpUrl(uploadPath);
      }

      stagedPathByUrl.current.set(displayUrl, uploadPath);
      return displayUrl;
    },
    [uploader, resolver]
  );

  const handleChange = useCallback(
    (content: Content) => {
      // Rewrite session-uploaded display URLs back to grida-tmp:// form so
      // the submit pipeline can discover and commit the staged files. URLs
      // not produced by this session (external images, already-committed
      // URLs from a previous submission) are left untouched.
      const restaged =
        content != null && typeof content === "object"
          ? (RichTextStagedFileUtils.restageDocument(
              content as object,
              stagedPathByUrl.current
            ) as Content)
          : content;
      const next = serialize(restaged);
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
