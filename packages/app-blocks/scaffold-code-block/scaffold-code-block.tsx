import React, { useState, useEffect } from "react";
import { format } from "@base-sdk/functions-code-format";

export interface ScaffoldCodeBlockProps {
  source: string;
  lang: "html" | "ts" | "js" | "dart";
}

export function ScaffoldCodeBlock(props: ScaffoldCodeBlockProps) {
  console.log("props", props);
  const [source, setSource] = useState(props.source);
  const onformat = () => {
    formatthis();
  };

  const formatthis = () => {
    format({
      code: source,
      lang: props.lang,
    })
      .then((c) => {
        setSource(c);
      })
      .catch((_) => {
        console.error(_);
      });
  };

  useEffect(() => {
    formatthis();
  }, [props.source]);

  return (
    <>
      ::TODO::
      <pre>
        <code>{source}</code>
      </pre>
      <FormatButton onClick={onformat} />
    </>
  );
}

function FormatButton(props: { onClick: () => void }) {
  return <button onClick={props.onClick}>format</button>;
}
