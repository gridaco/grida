"use client";

import { useEditorState } from "@/scaffolds/editor";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function EditorRouterProvider() {
  const [state, dispatch] = useEditorState();
  const pathname = usePathname();

  const { params, workbenchpath } = useMemo(() => {
    const [org, proj, docid, ...params] = pathname.split("/").filter(Boolean);
    const workbenchpath = params.join("/");
    return {
      org,
      proj,
      docid,
      params,
      workbenchpath,
    };
  }, [pathname]);

  useEffect(() => {
    dispatch({ type: "workbench/path", path: workbenchpath });
  }, [workbenchpath, dispatch]);

  return <></>;
}
