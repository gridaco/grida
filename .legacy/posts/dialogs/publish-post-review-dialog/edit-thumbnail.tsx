import React, { useRef, useState } from "react";
import { ThumbnailView } from "./edit-thumbnail-view";
export function EditThumbnailSegment({
  onFileUpload,
  initialThumbnail,
}: {
  /**
   * handle file
   * ```ts
   * let data = new FormData();
   * data.append("file", file);
   * ```
   */
  onFileUpload: (file: File) => void;

  initialThumbnail?: string;
}) {
  const inputFile = useRef(null);
  const [uploaded, setUploaded] = useState<string>(initialThumbnail);

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
        onChange={(event) => {
          // @ts-ignore
          let file = event.target.files[0];
          if (file) {
            if (file.size > 1048576 * 5) {
              alert("Oops. Thumbnail cannot be bigger than 5mb");
              return;
            }
            setUploaded(URL.createObjectURL(file));
            onFileUpload?.(file);
          }
        }}
        style={{ contentVisibility: "hidden" }}
      />
    </>
  );
}
