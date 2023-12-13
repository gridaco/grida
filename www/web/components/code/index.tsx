import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus as colorscheme } from "react-syntax-highlighter/dist/cjs/styles/prism";

export default function CodeBlock({ children, className }) {
  const language = className?.replace(/language-/, "");

  return (
    <SyntaxHighlighter
      language={language}
      style={colorscheme}
      customStyle={{
        padding: "20px",
        borderRadius: "5px",
        whiteSpace: "break-spaces",
      }}
    >
      {children}
    </SyntaxHighlighter>
  );
}
