import { useState, useEffect } from "react";
import type { TUseDesignFile, UseFigmaInput, UseFimgaFromUrl } from "./types";
import { Client } from "@figma-api/community";
import { TargetNodeConfig } from "query/target-node";

const client = Client();

/**
 * Figma Community File Retrieval Hook
 * This does not use...
 * 1. local store since the api response is static and cached by browser.
 * 2. procedual loading since whole file is archived at the server.
 * @returns
 */
export function useFigmaCommunityFile({ id }: { id: string }) {
  const [file, setFile] = useState<TUseDesignFile>({
    __type: "loading",
  });

  useEffect(() => {
    // load with community client
    client.file(id).then(({ data }) => {
      setFile({
        ...data,
        key: id,
        __initial: true, // ?
        __type: "file-fetched-for-app",
      });
    });
  }, [file]);

  //
  return file;
}

export function useFigmaCommunityNode() {
  const [design, setDesign] = useState<TargetNodeConfig>(null);
  throw new Error("not implemented");
  //
}
