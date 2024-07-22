"use client";

import React, { useEffect } from "react";
import useSWR from "swr";
import { useEditorState } from "../provider";

export function AssetsBackgroundsResolver({
  children,
}: React.PropsWithChildren<{}>) {
  const [, dispatch] = useEditorState();

  const { data } = useSWR("https://bg.grida.co/data", async (url: string) => {
    const res = await fetch(url);
    return res.json();
  });

  useEffect(() => {
    if (data) {
      // console.log("[EDITOR] backgrounds", data);
      dispatch({
        type: "editor/assets/init",
        backgrounds: data,
      });
    }
  }, [data]);

  return <>{children}</>;
}
