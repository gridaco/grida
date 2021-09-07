import {
  default as PrismHighlight,
  defaultProps,
  Language,
  Prism,
} from "prism-react-renderer";
import vsdark from "prism-react-renderer/themes/vsDark";

export default function CodeBlock({ children, className }) {
  const language = className.replace(/language-/, "");

  return (
    <PrismHighlight
      {...defaultProps}
      theme={vsdark}
      Prism={Prism}
      code={children}
      language={language}
    >
      {({ className, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={className + " font-firacode"}
          style={{
            ...style,
            padding: "20px",
            borderRadius: "5px",
            whiteSpace: "break-spaces",
          }}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line, key: i })}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token, key })} />
              ))}
            </div>
          ))}
        </pre>
      )}
    </PrismHighlight>
  );
}
