"use client";

import {
  Highlight as _Highlight,
  themes,
  Language,
} from "prism-react-renderer";

export function Hightlight({
  code,
  language,
}: {
  code: string;
  language: Language;
}) {
  <_Highlight theme={themes.shadesOfPurple} code={code} language={language}>
    {({ className, style, tokens, getLineProps, getTokenProps }) => (
      <pre style={style}>
        {tokens.map((line, i) => (
          <div key={i} {...getLineProps({ line })}>
            <span>{i + 1}</span>
            {line.map((token, key) => (
              <span key={key} {...getTokenProps({ token })} />
            ))}
          </div>
        ))}
      </pre>
    )}
  </_Highlight>;
}
