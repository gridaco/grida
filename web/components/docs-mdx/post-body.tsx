import { MDXProvider } from "@mdx-js/react";
import hydrate from "next-mdx-remote/hydrate";
import { useState } from "react";
import renderToString from "next-mdx-remote/render-to-string";
import useAsyncEffect from "utils/hooks/use-async-effect";
import CodeBlock from "components/code";
import styled from "@emotion/styled";

const components = {
  pre: props => <div {...props} />,
  code: CodeBlock,
};

export default function PostBody({ content }) {
  // const docs = hydrate(content, {})
  const [docs, setDocs] = useState(undefined);
  useAsyncEffect(async () => {
    const mdxSource = await renderToString(content, { components });
    setDocs(mdxSource.renderedOutput);
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Wrap
        dangerouslySetInnerHTML={{
          __html: docs,
        }}
      />
    </div>
  );
}

const Wrap = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  --space-y-reverse: 0;
  margin-top: calc(1.25rem * calc(1 - var(--space-y-reverse)));
  margin-bottom: calc(1.25rem * var(--space-y-reverse));
  line-height: 1.5;
  a {
    text-decoration: underline;
  }
  blockquote {
    padding-left: 0.5rem;
    border-left: 2px solid #9ca3af;
  }
  code {
    padding: 3px;
    margin: 1px;
    border-radius: 2px;
    background-color: #e5e7eb;
    color: red;
    font-family: FiraCode;
    font-size: 0.8rem;
  }
`;
