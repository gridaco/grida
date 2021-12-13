import React, { useCallback, useEffect, useReducer } from "react";
import { WorkspaceAction } from "core/actions";
import { useRouter } from "next/router";
import { Editor, warmup } from "scaffolds/editor";
import { useDesignFile } from "hooks/use-design";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";
import { StateProvider } from "core/states";

export default function FileEntryEditor() {
  const router = useRouter();
  const { key } = router.query;
  const filekey = key as string;

  const file = useDesignFile({ file: filekey });

  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    initialDispatcher({ type: "update", value: action });
  }, []);

  useEffect(() => {
    if (file) {
      const pages = file.document.children.map((page) => ({
        id: page.id,
        name: page.name,
        children: page["children"]?.map((child) => {
          const _mapped = mapper.mapFigmaRemoteToFigma(child);
          return convert.intoReflectNode(_mapped);
        }),
        type: "design",
      }));

      initialDispatcher({
        type: "set",
        value: {
          selectedNodes: [],
          selectedLayersOnPreview: [],
          design: {
            input: null,
            key: filekey,
            pages: pages,
          },
          selectedPage: warmup.selectedPage(null, pages, null),
        },
      });
    }
  }, [filekey, file, file?.document?.children]);

  const safe_value = warmup.safestate(initialState);

  return (
    <StateProvider state={safe_value} dispatch={handleDispatch}>
      <Editor />
    </StateProvider>
  );
}
