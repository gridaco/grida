import { css } from "@emotion/core";
import styled from "@emotion/styled";
import renderToString from "next-mdx-remote/render-to-string";
import Link from "next/link";
import React, { useState } from "react";
import { Flex, Text } from "rebass";

import CodeBlock from "components/code";
import Icon from "components/icon";
import useAsyncEffect from "utils/hooks/use-async-effect";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import { WasThisPostHelpful } from "./was-this-post-helpful";

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
      {/* temporarily disabled */}
      {/* <WasThisPostHelpful /> */}
      <Flex
        mt="40px"
        justifyContent="flex-end"
        style={{ borderTop: "1px solid #F8F8F8" }}
      >
        <Link href="https://github.com/gridaco/grida.co">
          <Text className="cursor" pt="24px" fontSize="16px" color="#2562FF">
            Edit this page on Github
          </Text>
        </Link>
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

const textBased = css`
  font-size: 16px;
  line-height: 139%;
  color: #686868;
`;

const Wrap = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  --space-y-reverse: 0;
  margin-top: calc(1.25rem * calc(1 - var(--space-y-reverse)));
  margin-bottom: calc(1.25rem * var(--space-y-reverse));
  line-height: 1.5;

  img {
    width: 100%;
  }

  p {
    ${textBased}
  }

  a {
    ${textBased};
    text-decoration: underline;
  }

  blockquote {
    ${textBased};
    padding-left: 8px;
    border-left: 7px solid #ededed;
    // 2px is border size
    margin-inline-start: 7px;
    margin-block-start: 0;
    color: #5a5a5a;
  }
  code {
    padding: 3px;
    margin: 1px;
    border-radius: 2px;
    background-color: #e5e7eb;
    // FIXME: why red?
    color: red;
    font-family: FiraCode;
  }
  ul {
    padding-left: 0;

    font-size: 16px;
    ${textBased};
    ul {
      padding-left: 20px;
    }
  }

  li {
    list-style-position: inside;
    text-indent: 5px;
    ${textBased};

    &::marker {
      color: #686868;
      font-size: 23px;
    }
  }

  // figma design : ~ breakpoints[3] screen
  ${props => media((props.theme as ThemeInterface).breakpoints[2], null)} {
    h1 {
      font-size: 64px;
      line-height: 88.19%;
      /* or 56px */

      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 48px;
      line-height: 59px;
    }
    h3 {
      font-size: 36px;
      line-height: 44px;
    }
  }

  ${props => media(null, (props.theme as ThemeInterface).breakpoints[2])} {
    h1 {
      font-size: 64px;
      line-height: 64px;
    }
    h2 {
      font-size: 48px;
      line-height: 56px;
    }
    h3 {
      font-size: 36px;
      line-height: 44px;
    }
  }

  ${props => media(null, (props.theme as ThemeInterface).breakpoints[1])} {
    h1 {
      font-size: 64px;
      line-height: 88.19%;
      /* or 56px */

      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 48px;
      line-height: 59px;
    }
    h3 {
      font-size: 36px;
      line-height: 44px;
    }
  }
  ${props => media(null, (props.theme as ThemeInterface).breakpoints[0])} {
    h1 {
      font-size: 64px;
      line-height: 88.19%;

      letter-spacing: -0.02em;
    }
    h2 {
      font-size: 48px;
      line-height: 59px;
    }
    h3 {
      font-size: 36px;
      line-height: 44px;
    }
  }

  ${media(null, "320px")} {
    h1 {
      font-size: 36px;
      line-height: 100.69%;
    }
    h2 {
      font-size: 48px;
      line-height: 59px;
    }
    h3 {
      font-size: 36px;
      line-height: 44px;
    }
    p,
    ul,
    li {
      font-size: 14px;
      line-height: 139%;
    }
    blockquote {
      font-size: 14px;
      line-height: 16px;
    }
  }
`;
