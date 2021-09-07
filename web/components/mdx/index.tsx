import { css } from "@emotion/core";
import styled from "@emotion/styled";
import React from "react";

import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import Button from "./button";
import { SectionLayout } from "./layout";
import { Title } from "./title";

export const _MDX_COMPONENTS = {
  h1: props => <MdxWrapper style={{ color: "black" }} {...props} />,
};

// add Title
const Mdx = {
  Button,
  SectionLayout,
  Title,
};

// FIXME: move style post-body's to mdx in here
const textBased = css`
  font-size: 16px;
  line-height: 139%;
  color: #686868;
`;

const MdxWrapper = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  --space-y-reverse: 0;
  margin-top: calc(1.25rem * calc(1 - var(--space-y-reverse)));
  margin-bottom: calc(1.25rem * var(--space-y-reverse));
  line-height: 1.5;

  p {
    ${textBased}
  }

  a {
    ${textBased};
    text-decoration: underline;
  }

  blockquote {
    ${textBased};
    border-left: 7px solid #ededed;
    margin-inline-start: 7px;
    margin-block-start: 0;
    padding-left: 8px;

    color: #5a5a5a; // using textBased but diff only color
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
    ${textBased};
    padding: 0;
  }

  li {
    list-style-position: inside;
    text-indent: 5px;
    ${textBased};

    &::marker {
      color: #686868;
      content: "\\2022";
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

export default Mdx;
