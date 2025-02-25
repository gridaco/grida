"use client";

import {
  Highlight as _Highlight,
  themes,
  Language,
} from "prism-react-renderer";

const supported_themes = {
  "vs-dark": themes.vsDark,
  "vs-light": themes.vsLight,
};

export function Hightlight({
  code,
  language,
  theme = "vs-light",
  options,
}: {
  code: string;
  language: Language;
  theme?: "vs-dark" | "vs-light";
  options?: {
    lineNumbers: "off" | "on";
  };
}) {
  return (
    <_Highlight theme={supported_themes[theme]} code={code} language={language}>
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre style={style}>
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              <span hidden={options?.lineNumbers === "off"}>{i + 1}</span>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </_Highlight>
  );
}
