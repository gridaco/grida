import { css } from "@emotion/core";
import styled from "@emotion/styled";
import React from "react";

import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import Button from "./button";
import { SectionLayout } from "./layout";
import { Title } from "./title";

export const _MDX_COMPONENTS = {
  div: props => <h1 {...props} />,
};
export const H1 = props => <h2 style={{ color: "red" }} {...props} />;

// add Title
const Mdx = {
  Button,
  SectionLayout,
  Title,
};
