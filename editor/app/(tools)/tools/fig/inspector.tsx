"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import {
  type FigmaMeta,
  type Header,
  type Message,
  type ParsedFigmaArchive,
  type ParsedFigmaHTML,
  type Schema as CompiledSchema,
  getThumbnail,
  compileSchema,
  prettyPrintSchema,
} from "@grida/io-figma/fig-kiwi";
import type { GUID, NodeChange } from "@grida/io-figma/fig-kiwi/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/lib/utils";
import { Button } from "@/components/ui/button";
import { NodeTypeIcon } from "./node-type-icon";
import { ThemedMonacoEditor } from "@/components/monaco";

type FileContents = ParsedFigmaArchive | ParsedFigmaHTML;

type NavSelection =
  | { type: "layer"; guid: GUID }
  | { type: "preview" }
  | { type: "meta" }
  | { type: "misc" }
  | { type: "blobs" }
  | { type: "schema" };

export function FigmaFile({ data }: { data: FileContents }) {
  const type = "meta" in data ? "paste" : "file";
  const [navSelection, setNavSelection] = useState<NavSelection>(() => {
    // Default to "meta" for paste, "preview" for file
    return type === "paste" ? { type: "meta" } : { type: "preview" };
  });
  const node =
    navSelection.type === "layer" && selectedNode(data.message, navSelection);
  const { message } = data;
  const {
    nodeChanges = [],
    isCut,
    pasteID,
    pasteFileKey,
    pasteBranchSourceFileKey,
    pasteIsPartiallyOutsideEnclosingFrame,
    pastePageId,
    pasteEditorType,
    blobs,
    ...rest
  } = message;
  return (
    <div className="flex flex-row h-full w-full">
      <div className="w-64 border-r border-border flex-shrink-0 overflow-y-auto">
        <Sidebar
          type={type}
          message={data.message}
          navSelection={navSelection}
          setNavSelection={setNavSelection}
        />
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6">
          {navSelection.type === "meta" && "meta" in data && (
            <FigmaPasteInfo
              meta={data.meta}
              more={{
                pasteEditorType,
                pasteID,
                pastePageId,
                pasteFileKey,
                pasteBranchSourceFileKey,
                pasteIsPartiallyOutsideEnclosingFrame,
                isCut,
              }}
            />
          )}
          {navSelection.type === "misc" && (
            <Card>
              <CardHeader>
                <CardTitle>Misc</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[800px] border-t border-border">
                  <ThemedMonacoEditor
                    height="100%"
                    language="json"
                    value={JSON.stringify(rest, replacerForHex, 2)}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      lineNumbers: "on",
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          )}
          {navSelection.type === "schema" && "header" in data && (
            <Schema schema={data.schema as any} header={data.header} />
          )}
          {navSelection.type === "preview" && (
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Try to get preview from archive first
                  let preview: Uint8Array | undefined;
                  if (
                    "preview" in data &&
                    data.preview &&
                    data.preview.length > 0
                  ) {
                    preview = data.preview;
                  } else if ("zip_files" in data && data.zip_files) {
                    // Fallback to thumbnail from ZIP
                    preview = getThumbnail(data.zip_files);
                  }

                  return preview ? (
                    <div className="flex flex-col gap-4">
                      <p className="text-xs text-muted-foreground">
                        {preview.length.toLocaleString()} bytes
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        alt="Preview thumbnail"
                        src={`data:image/png;base64,${uint8ArrayToBase64(
                          preview
                        )}`}
                        className="max-w-full h-auto rounded-md border border-border"
                      />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm text-muted-foreground">
                        No preview available for this file
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        The .fig file does not contain a preview thumbnail
                      </p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {navSelection.type === "blobs" && blobs && <Blobs blobs={blobs} />}
          {node && (
            <NodeContent
              node={node}
              schema={data.schema as any}
              href={
                "meta" in data
                  ? figmaUrl(data.meta.fileKey, node.guid!)
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return typeof window !== "undefined"
    ? window.btoa(binary)
    : Buffer.from(binary).toString("base64");
}

function Blobs({ blobs }: { blobs: Exclude<Message["blobs"], undefined> }) {
  return (
    <div className="flex flex-col gap-4">
      {blobs.map((b, i) => (
        <Card key={i}>
          <CardHeader>
            <CardTitle>
              Blob {i}{" "}
              <span className="font-normal text-muted-foreground">
                ({b.bytes.length.toLocaleString()} bytes)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[400px] p-4 bg-muted rounded-md">
              <pre className="font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap">
                {hex(b.bytes, " ")}
              </pre>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

type PasteMore = Pick<
  Message,
  | "pasteID"
  | "isCut"
  | "pastePageId"
  | "pasteEditorType"
  | "pasteFileKey"
  | "pasteBranchSourceFileKey"
  | "pasteIsPartiallyOutsideEnclosingFrame"
>;

function FigmaPasteInfo({ meta, more }: { meta: FigmaMeta; more: PasteMore }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paste Info</CardTitle>
        <FigmaLink href={figmaUrl(meta.fileKey, undefined)} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fileKey">File Key</Label>
          <Input id="fileKey" value={meta.fileKey} readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dataType">Data Type</Label>
          <Input id="dataType" value={meta.dataType} readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pasteID">Paste ID</Label>
          <Input id="pasteID" value={meta.pasteID.toString()} readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pasteFileKey">Paste File Key</Label>
          <Input id="pasteFileKey" value={more.pasteFileKey ?? ""} readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pasteBranchSourceFileKey">Branch Source File</Label>
          <Input
            id="pasteBranchSourceFileKey"
            value={more.pasteBranchSourceFileKey ?? ""}
            readOnly
          />
        </div>
      </CardContent>
    </Card>
  );
}

function selectedNode(message: Message, navSelection: NavSelection) {
  if (navSelection.type === "layer") {
    return message.nodeChanges?.find(
      (n) =>
        n.guid &&
        navSelection.guid &&
        formatGUID(n.guid) === formatGUID(navSelection.guid)
    );
  }
}

function Sidebar({
  type,
  message,
  navSelection,
  setNavSelection,
}: {
  type: "paste" | "file";
  message: Message;
  navSelection: NavSelection;
  setNavSelection: (navSelection: NavSelection) => void;
}) {
  const { nodeChanges = [] } = message;
  return (
    <div className="p-4 h-full flex flex-col gap-6">
      <div>
        <h2 className="font-semibold px-2 py-1 text-sm text-muted-foreground uppercase tracking-wide">
          Metadata
        </h2>
        <ul className="flex flex-col gap-1 mt-2">
          {type === "paste" && (
            <SidebarItem
              onClick={() => setNavSelection({ type: "meta" })}
              selected={navSelection.type === "meta"}
            >
              Paste Info
            </SidebarItem>
          )}
          {type === "file" && (
            <SidebarItem
              onClick={() => setNavSelection({ type: "preview" })}
              selected={navSelection.type === "preview"}
            >
              Preview
            </SidebarItem>
          )}
          <SidebarItem
            onClick={() => setNavSelection({ type: "schema" })}
            selected={navSelection.type === "schema"}
          >
            Schema
          </SidebarItem>
          <SidebarItem
            onClick={() => setNavSelection({ type: "misc" })}
            selected={navSelection.type === "misc"}
          >
            Misc
          </SidebarItem>
          <SidebarItem
            onClick={() => setNavSelection({ type: "blobs" })}
            selected={navSelection.type === "blobs"}
          >
            Blobs
          </SidebarItem>
        </ul>
      </div>
      <div>
        <h2 className="font-semibold px-2 py-1 text-sm text-muted-foreground uppercase tracking-wide">
          Nodes
        </h2>
        <ol className="flex flex-col gap-1 mt-2 overflow-clip">
          {nodeChanges.map((n) => {
            if (!n.guid) return null;
            const { guid, name, type } = n;
            return (
              <SidebarItem
                key={formatGUID(guid)}
                selected={
                  navSelection.type === "layer" &&
                  formatGUID(navSelection.guid) === formatGUID(guid)
                }
                onClick={() => setNavSelection({ type: "layer", guid })}
                className="flex flex-row items-center gap-1.5 py-1 text-xs"
              >
                <NodeTypeIcon type={type || "?"} className="size-3 shrink-0" />
                <span className="truncate flex-1">{name || "Untitled"}</span>
              </SidebarItem>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

const SidebarItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement> & {
    selected: boolean;
  }
>(({ className, selected, children, ...props }, ref) => {
  return (
    <li
      ref={ref}
      className={cn(
        "rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors",
        "hover:bg-muted/50",
        selected && "bg-muted font-medium",
        className
      )}
      {...props}
    >
      {children}
    </li>
  );
});

SidebarItem.displayName = "SidebarItem";

function Schema({ schema, header }: { schema: any; header: Header }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Schema <span className="text-muted-foreground">{header.version}</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground font-mono">
          {JSON.stringify(header.prelude)}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[800px] border-t border-border">
          <ThemedMonacoEditor
            height="100%"
            language="json"
            value={prettyPrintSchema(schema)}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              lineNumbers: "on",
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FigmaLink({ href, name }: { href?: string; name?: string }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-block mt-2"
    >
      <Button variant="outline" size="sm">
        {name ? `Open ${name} in Figma` : `Open in Figma`}
      </Button>
    </a>
  );
}

function NodeContent({
  node,
  schema,
  href,
}: {
  node: NodeChange;
  schema: any;
  href?: string;
}) {
  const compiledSchema: CompiledSchema = useMemo(() => {
    // Schema is raw definitions from fig-kiwi, compile it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return compileSchema(schema as any) as CompiledSchema;
  }, [schema]);
  const data = useMemo(() => {
    if (!node.guid) return;
    return compiledSchema.encodeNodeChange(node);
  }, [node, compiledSchema]);

  const decoded = JSON.stringify(node, replacerForHex, 2);
  const nodeType = node.type || "UNKNOWN";
  const nodeName = node.name || "Untitled";
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {nodeType} ({nodeName})
        </CardTitle>
        <FigmaLink href={href} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <h3 className="text-sm font-semibold mb-3">
            As JSON{" "}
            <span className="font-normal text-muted-foreground">
              ({decoded.length.toLocaleString()} bytes)
            </span>
          </h3>
          <div className="h-[600px] border border-border rounded-md overflow-hidden">
            <ThemedMonacoEditor
              height="100%"
              language="json"
              value={decoded}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                lineNumbers: "on",
              }}
            />
          </div>
        </div>
        {data && (
          <div>
            <h3 className="text-sm font-semibold mb-3">
              As Kiwi Binary{" "}
              <span className="font-normal text-muted-foreground">
                ({data.length.toLocaleString()} bytes)
              </span>
            </h3>
            <div className="h-[300px] overflow-auto bg-muted rounded-md border border-border p-4">
              <pre className="font-mono text-xs text-muted-foreground break-all whitespace-pre-wrap m-0">
                {hex(data, " ")}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatGUID(guid: GUID): string {
  return `${guid.sessionID}:${guid.localID}`;
}

function hex(bytes: Uint8Array, pad?: string): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    if (hex.length && pad) {
      hex += pad;
    }
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function replacerForHex(_key: string, value: any) {
  if (value instanceof Uint8Array) {
    if (value.length === 20) return `sha1(${hex(value)})`;
    if (value.length === 32) return `sha256(${hex(value)})`;
    return `hex(${hex(value)})`;
  }
  return value;
}

function figmaUrl(fileKey: string, guid?: GUID): string {
  const name = "Untitled";
  const nid = guid ? `?node-id=${formatGUID(guid)}` : "";
  return `https://www.figma.com/file/${fileKey}/${name}${nid}`;
}
