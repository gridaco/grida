"use client";

import { useEffect, useReducer, useState } from "react";
import { GridaLogo } from "@/components/grida-logo";
import { ThemedMonacoEditor } from "@/components/monaco";
import {
  EditorSurface,
  StandaloneSceneContent,
  StandaloneDocumentEditor,
  standaloneDocumentReducer,
  ViewportRoot,
} from "@/grida-react-canvas";
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import grida from "@grida/schema";
import { v4 } from "uuid";
import { useFilePicker } from "use-file-picker";
import { Button } from "@/components/ui/button";
import { useHotkeys } from "react-hotkeys-hook";
import { editor } from "@/grida-canvas";
import iosvg from "@grida/io-svg";
import Link from "next/link";

export default function IOSVGPage() {
  const [raw, setRaw] = useState<string>();
  const [svgo, setSvgo] = useState<string>();
  const [result, setResult] = useState<any>();
  const { openFilePicker, filesContent } = useFilePicker({
    readAs: "Text",
    multiple: false,
    accept: ".svg",
  });

  const [state, dispatch] = useReducer(
    standaloneDocumentReducer,
    editor.state.init({
      editable: true,
      debug: true,
      document: {
        nodes: {},
        scenes: {
          iosvg: {
            type: "scene",
            id: "iosvg",
            name: "iosvg",
            children: [],
            guides: [],
            constraints: {
              children: "single",
            },
          },
        },
      },
    })
  );

  useHotkeys("ctrl+o, meta+o", openFilePicker, {
    preventDefault: true,
  });

  useEffect(() => {
    if (filesContent.length === 0) {
      return;
    }
    const svgstr = filesContent[0].content;
    setRaw(svgstr);
  }, [filesContent]);

  useEffect(() => {
    if (!raw) {
      return;
    }
    const optimized = iosvg.v0.optimize(raw);
    setSvgo(optimized.data);
  }, [raw]);

  useEffect(() => {
    if (!svgo) {
      setResult(undefined);
      return;
    }

    iosvg.v0
      .convert(svgo, {
        name: "SVG",
        currentColor: { r: 0, g: 0, b: 0, a: 1 },
      })
      .then((result) => {
        if (result) {
          const doc =
            grida.program.nodes.factory.packed_scene_document_to_full_document(
              grida.program.nodes.factory.create_packed_scene_document_from_prototype(
                result,
                () => v4()
              )
            );

          dispatch({
            type: "__internal/reset",
            state: editor.state.init({
              editable: true,
              document: doc,
            }),
          });
        }
        setResult(result);
        //
      })
      .catch(console.error);
  }, [svgo]);

  return (
    <main className="w-dvw h-dvh overflow-hidden">
      <div className="flex flex-col w-full h-full">
        <header className="flex items-center justify-between p-4 border-b">
          <div className="flex gap-4 items-center">
            <Link href="/canvas">
              <GridaLogo className="size-4" />
            </Link>
            <div className="flex flex-col">
              <span className="text-sm font-bold font-mono">tools/io-svg</span>
            </div>
          </div>
          {/*  */}
          <Button onClick={openFilePicker}>Open SVG ⌘+O</Button>
        </header>
        <div className="flex w-full h-full">
          <aside className="flex-1 h-full w-full">
            <div className="h-1/3 w-full">
              <ThemedMonacoEditor
                width="100%"
                height="100%"
                language="xml"
                value={raw ?? ""}
                onChange={setRaw}
                options={{ readOnly: false }}
              />
            </div>
            <div className="h-1/3 w-full">
              <ThemedMonacoEditor
                width="100%"
                height="100%"
                language="xml"
                value={svgo ?? ""}
                onChange={setSvgo}
                options={{ readOnly: false }}
              />
            </div>
            <div className="h-1/3 w-full">
              <ThemedMonacoEditor
                width="100%"
                height="100%"
                language="json"
                value={JSON.stringify(result, null, 2)}
                options={{ readOnly: true }}
              />
            </div>
          </aside>
          <aside className="flex-1 h-full w-full">
            <div className="flex gap-2">
              <section className="flex-1">
                <span className="text-sm font-bold font-mono">Grida</span>
                <div className="w-full border h-96">
                  <StandaloneDocumentEditor
                    editable
                    dispatch={dispatch}
                    initial={state}
                  >
                    <ViewportRoot className="relative w-full h-full p-4">
                      <EditorSurface />
                      <AutoInitialFitTransformer>
                        <StandaloneSceneContent className="w-full h-full" />
                      </AutoInitialFitTransformer>
                    </ViewportRoot>
                  </StandaloneDocumentEditor>
                </div>
                <span className="text-sm font-bold font-mono">SVG / SVGO</span>
                <div className="flex w-full h-96 p-4 border overflow-scroll">
                  <div className="flex-1">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: raw ?? "",
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <div
                      dangerouslySetInnerHTML={{
                        __html: svgo ?? "",
                      }}
                    />
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
