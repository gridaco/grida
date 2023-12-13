import styled from "@emotion/styled";
import renderToString from "next-mdx-remote/render-to-string";
import Link from "next/link";
import React, { useState } from "react";
import { Flex, Text } from "theme-ui";

import CodeBlock from "components/code";
import Icon from "components/icon";
import useAsyncEffect from "utils/hooks/use-async-effect";
import { media } from "utils/styled/media";

import { WasThisPostHelpful } from "./was-this-post-helpful";

const components = {
  pre: props => <div {...props} />,
  code: CodeBlock,
};

export default function PostBody({ content }) {
  // const docs = hydrate(content, {})
  const [docs, setDocs] = useState(undefined);
  useAsyncEffect(async () => {
    // @ts-ignore
    const mdxSource = await renderToString(content, { components });
    setDocs(mdxSource.renderedOutput);
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Documentation
        dangerouslySetInnerHTML={{
          __html: docs,
        }}
      ></Documentation>
      <Flex
        style={{
          justifyContent: "space-between",
        }}
        mt="90px"
      >
        <Flex
          className="cursor-pointer"
          style={{
            alignItems: "center",
          }}
        >
          <CustomIcon
            name="arrowDown"
            isVerticalMiddle
            style={{ transform: "rotate(90deg)", marginRight: "12px" }}
          />
          <Text
            style={{
              fontSize: "16px",
            }}
            color="#2562FF"
          >
            Prev
          </Text>
        </Flex>
        <Flex
          className="cursor-pointer"
          style={{
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: "16px" }} color="#2562FF">
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
        style={{
          justifyContent: "flex-end",
          borderTop: "1px solid #F8F8F8",
        }}
      >
        <Link href="https://github.com/gridaco/grida.co">
          <Text
            className="cursor-pointer"
            pt="24px"
            style={{
              fontSize: "16px",
            }}
            color="#2562FF"
          >
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

const Documentation = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  line-height: 1.5;

  p,
  a,
  ul,
  ol,
  li {
    font-size: 16px;
    line-height: 139%;
    color: #686868;
  }

  h1,
  h2,
  h3 {
    margin: 0;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    color: #000000;
  }

  img {
    width: 100%;
  }

  a {
    text-decoration: underline;
  }

  blockquote {
    padding-left: 8px;
    border-left: 6px solid #ededed;
    margin-inline-start: 0px;
    margin-block-start: 6px;
    color: #5a5a5a;
  }

  code {
    padding: 2px 4px;
    margin: 1px;
    border-radius: 2px;
  }

  ul {
    padding-left: 0;

    font-size: 16px;
    ul {
      padding-left: 20px;
    }
  }

  li {
    &::marker {
      color: #686868;
      font-size: 16px;
    }
  }

  h1 {
    font-size: 3rem;
    font-weight: 700;
    line-height: 1.35;
    margin-top: 0.75rem;
    letter-spacing: -0.02em;
  }

  h2 {
    font-size: 2rem;
    font-weight: 600;
    line-height: 1.5;
    margin: 3.5rem 0 2rem 0;
  }

  h3,
  h4,
  h5,
  h6 {
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.6;
    margin: 3.5rem 0 2rem 0;
  }

  // figma design : ~ breakpoints[3] screen
  ${props => media(props.theme.breakpoints[2], null)} {
  }
  ${props => media(null, props.theme.breakpoints[2])} {
  }
  ${props => media(null, props.theme.breakpoints[1])} {
  }
  ${props => media(null, props.theme.breakpoints[0])} {
    li {
      list-style-position: inside;
    }
  }

  ${media(null, "320px")} {
    li {
      list-style-position: inside;
    }
  }
`;
