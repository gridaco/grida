import React, { useRef, useState } from "react";
import styled from "@emotion/styled";
import { ThumbnailView } from "./edit-thumbnail-view";
export function EditThumbnailSegment({
  onFileUpload,
}: {
  /**
   * handle file
   * ```ts
   * let data = new FormData();
   * data.append("file", file);
   * ```
   */
  onFileUpload: (file: File) => void;
}) {
  const inputFile = useRef(null);
  const [uploaded, setUploaded] = useState<string>();

  return (
    <>
      <ThumbnailView
        label={uploaded ? "Change thumbnail" : "Upload an image"}
        src={uploaded}
        onClick={() => {
          inputFile.current.click();
        }}
      />
      <input
        type="file"
        id="file"
        accept="image/*"
        ref={inputFile}
        onInput={(event) => {
          // @ts-ignore
          let file = event.target.files[0];
          if (file) {
            setUploaded(URL.createObjectURL(file));
            onFileUpload?.(file);
          }
        }}
        style={{ contentVisibility: "hidden" }}
      />
    </>
  );
}
