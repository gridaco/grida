import { MDXProvider } from "@mdx-js/react";
import hydrate from "next-mdx-remote/hydrate";
import { useState } from "react";
import renderToString from "next-mdx-remote/render-to-string";
import useAsyncEffect from "utils/hooks/use-async-effect";
import CodeBlock from "components/code";
import styled from "@emotion/styled";
import { Flex, Text } from "rebass";
import Icon from "components/icon";

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
      <Flex justifyContent="space-between" mt="90px">
        <Flex className="cursor" alignItems="center">
          <CustomIcon
            name="arrowDown"
            isVerticalMiddle
            style={{ transform: "rotate(90deg)" }}
          />
          <Text fontSize="16px" color="#2562FF">
            Prev
          </Text>
        </Flex>

        <Flex className="cursor" alignItems="center">
          <Text fontSize="16px" color="#2562FF">
            Next
          </Text>
          <CustomIcon
            name="arrowDown"
            isVerticalMiddle
            style={{ transform: "rotate(270deg)" }}
          />
        </Flex>
      </Flex>
      <Flex
        alignItems="center"
        justifyContent="center"
        mt="60px"
        flexDirection="column"
      >
        <Text fontSize="18px" fontWeight="bold" color="#686868">
          Was this page helpful?
        </Text>
        <Flex mt="16px">
          <Icon className="cursor" name="thumbsup" mx="16px" />
          <Icon className="cursor" name="thumbsdown" mx="16px" />
        </Flex>
      </Flex>
      <Flex
        mt="40px"
        justifyContent="flex-end"
        style={{ borderTop: "1px solid #F8F8F8" }}
      >
        <Text className="cursor" pt="24px" fontSize="16px" color="#2562FF">
          Edit this page on Github
        </Text>
      </Flex>
    </div>
  );
}

const CustomIcon = styled(Icon)`
  svg {
    path {
      fill: #2562ff;
    }
  }
`;

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
