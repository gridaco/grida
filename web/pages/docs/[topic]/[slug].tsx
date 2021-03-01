import React, { useEffect } from "react";
import renderToString from "next-mdx-remote/render-to-string";
import hydrate from "next-mdx-remote/hydrate";
import matter from "gray-matter";
import DocsNavigation from "layouts/docs-navigation";
import { Flex } from "rebass";

const DocsInnerContent = ({ mdxSource, docsList }) => {
  const content = hydrate(mdxSource);

  return (
    <Flex my="90px">
      <DocsNavigation />
      <div className="wrapper">{content}</div>
    </Flex>
  );
};

DocsInnerContent.getInitialProps = async context => {
  const {
    query: { topic, slug },
  } = context;
  const markdown = await import(`../../../../docs/${topic}/${slug}.md`);
  const { content } = matter(markdown.default);
  const mdxSource = await renderToString(content);
  return { mdxSource };
};

export default DocsInnerContent;
