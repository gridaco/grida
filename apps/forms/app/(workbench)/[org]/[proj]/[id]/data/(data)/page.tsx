"use client";

import React from "react";
import { Spinner } from "@/components/spinner";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useEditorState } from "@/scaffolds/editor";
import { editorlink } from "@/lib/forms/url";

export default function DataIndexPage() {
  const [state] = useEditorState();
  const router = useRouter();

  useEffect(() => {
    switch (state.doctype) {
      case "v0_form": {
        router.replace("./data/responses");
        break;
      }
      case "v0_schema": {
        const table = state.tables?.[0];
        if (table) {
          router.replace(
            editorlink("data/table/[tablename]", {
              basepath: state.basepath,
              document_id: state.document_id,
              tablename: table.name,
            })
          );
        } else {
          router.replace(
            editorlink("data/table/~new", {
              basepath: state.basepath,
              document_id: state.document_id,
            })
          );
        }
        break;
      }
    }
  }, [router, state.doctype, state.basepath, state.document_id, state.tables]);

  return (
    <main className="w-full h-full flex justify-center items-center">
      <Spinner />
    </main>
  );
}
