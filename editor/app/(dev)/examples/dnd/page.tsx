"use client";

import React, { useCallback } from "react";

export default function PasteAndDropHandler() {
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      const items = event.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file") {
          const file = item.getAsFile();
          alert("Pasted file: " + file?.name);
          console.log("Pasted file:", file);
        } else if (item.kind === "string") {
          item.getAsString((text) => {
            alert("Pasted text: " + text);
            console.log("Pasted text:", text);
          });
        }
      }
    },
    []
  );

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      alert("Dropped file: " + files[i].name);
      console.log("Dropped file:", files[i]);
    }
  }, []);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault(); // Prevent the default browser behavior for drag-and-drop
  };

  return (
    <main className="w-full h-full">
      <div
        style={{
          width: "100%",
          height: "200px",
          border: "2px dashed #ccc",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        onPasteCapture={handlePaste}
        onDropCapture={handleDrop}
        onDragOverCapture={handleDragOver}
      >
        <p>Paste or Drop Files Here</p>
      </div>
    </main>
  );
}
