import React, { useEffect, useRef, useState } from "react";
export function ImportFileButton(props: { children: JSX.Element }) {
  const [expandIds, setExpandIds] = useState([]);
  const fileInput = useRef(null);

  const onExpandStruct = (id: string) => {
    setExpandIds((d) => [...d, id]);
  };

  const onFileUpload = (e) => {
    const reader = new FileReader();
    e.preventDefault();
    reader.onload = function () {
      console.log(reader.result);
    };
    try {
      reader.readAsText(e.target.files[0], "UTF-8");
    } catch (e) {
      console.error(`ERROR : import ( json ... + etc )\ndetail : ${e}`);
    }
  };

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        style={{ display: "none" }}
        onChange={onFileUpload}
        accept=".json"
      />
      <span onClick={() => fileInput.current.click()}>{props.children}</span>
    </>
  );
}
