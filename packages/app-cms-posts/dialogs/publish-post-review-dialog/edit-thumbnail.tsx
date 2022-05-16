import React, { useRef } from "react";
import styled from "@emotion/styled";
import { ThumbnailView } from "./edit-thumbnail-view";
export function EditThumbnailSegment() {
  const inputFile = useRef(null);

  return (
    <>
      <ThumbnailView
        label="Upload an image"
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
            let data = new FormData();
            data.append("file", file);
            // axios.post('/files', data)...
          }
        }}
        style={{ contentVisibility: "hidden" }}
      />
    </>
  );
}
