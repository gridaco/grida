import styled from "@emotion/styled";
import { MDXProvider } from "@mdx-js/react";
import hydrate from "next-mdx-remote/hydrate";
import renderToString from "next-mdx-remote/render-to-string";
import { useState } from "react";
import { Flex, Text } from "rebass";

import CodeBlock from "components/code";
import Icon from "components/icon";
import useAsyncEffect from "utils/hooks/use-async-effect";

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
      <div
        dangerouslySetInnerHTML={{
          __html: docs,
        }}
      />
      <Flex justifyContent="space-between" mt="90px">
        <Flex className="cursor" alignItems="center">
          <CustomIcon
            name="arrowDown"
            isVerticalMiddle
            style={{ transform: "rotate(90deg)", marginRight: "12px" }}
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
            style={{ transform: "rotate(270deg)", marginLeft: "12px" }}
          />
        </Flex>
      </Flex>
      <Flex
        alignItems="center"
        justifyContent="center"
        mt="60px"
        flexDirection="column"
      >
        <Text fontSize="18px" fontWeight="500" color="#686868">
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
