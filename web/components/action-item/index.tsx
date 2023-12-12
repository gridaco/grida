import styled from "@emotion/styled";
import { motion } from "framer-motion";
import Link from "next/link";
import React from "react";

import Icon from "components/icon";
import { media } from "utils/styled/media";

const Colors = {
  light: {
    default: "#7d7d7d",
    hover: "#1c1c1c",
  },
  dark: {
    default: "#7d7d7d",
    hover: "#aeaeae",
  },
};

const ActionItem = ({
  label,
  href,
  as,
  locale,
  theme = "light",
  target,
}: {
  label: string;
  href: string;
  as?: string;
  locale?: string;
  theme?: "light" | "dark";
  target?: string;
}) => {
  const Content = (
    <Text
      className="cursor"
      color={Colors[theme]["default"]}
      whileHover={{ color: Colors[theme]["hover"] }}
    >
      {label}
      <Icon
        name="arrowDown"
        isVerticalMiddle
        style={{ transform: "rotate(270deg)" }}
      />
    </Text>
  );

  return (
    <Link href={href} as={as} locale={locale} target={target}>
      {Content}
    </Link>
  );
};

const Text = styled(motion.span)<{ color: string }>`
  max-width: calc(100vw - 40px);
  width: 100vw;
  margin-right: auto;
  color: ${p => p.color};
  font-size: 24px;
  margin-bottom: 25px;
  letter-spacing: 0em;
  font-weight: 500;
  display: flex;
  align-items: center;

  ${props => media("0px", props.theme.breakpoints[0])} {
    font-size: 17px;
  }
`;

export default ActionItem;
