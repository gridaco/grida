import {
  analyze,
  parseFileAndNodeId,
  FigmaUrlType,
  FigmaFileOrNodeIdType,
} from "@design-sdk/figma-url/dist";
import styled from "@emotion/styled";
import { motion } from "framer-motion";
import React, { useCallback, useState } from "react";
import { Flex } from "rebass";

import { usePopupContext } from "utils/context/PopupContext";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import { HeroPrimaryButton } from "./hero-primary-button";
import { HeroPrimaryInput } from "./hero-primary-input";

export function CtaArea() {
  const [input, setInput] = useState<string>(null);
  const { addPopup, removePopup } = usePopupContext();

  const showInvalidUrlGuide = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <Flex
          width="calc(100vw - 40px)"
          alignItems="center"
          flexDirection="column"
          p="48px"
        >
          What is extra usage fee? Extre usage fee is only for team plan. For
          free plan users, there are no ways to access more than capacity
          provided by default. You’ll need to change your plan to Team or above.
        </Flex>
      ),
    });
  }, []);

  const oauthurl =
    "https://www.figma.com/oauth?client_id=USz3HnKVO6Y2HUED98ZEzf&redirect_uri=http://localhost:3000/callback/figma-oauth&scope=file_read&state=:state&response_type=code";

  const showFigmaAuthModal = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <Flex
          width="calc(100vw - 40px)"
          alignItems="center"
          flexDirection="column"
          p="48px"
        >
          <button
            onClick={() => {
              window.open(
                oauthurl,
                "authenticate",
                "popup, location=no, status=no, menubar=no, width=620, height=600",
              );
            }}
          >
            Authenticate with figma
          </button>
        </Flex>
      ),
    });
  }, []);

  const onSubmit = () => {
    const ananysis = analyze(input);
    switch (ananysis) {
      case FigmaUrlType.empty: {
        showInvalidUrlGuide();
      }
      case FigmaUrlType.embed:
      case FigmaUrlType.file:
      case FigmaUrlType.node:
      case FigmaFileOrNodeIdType.fileid:
      case FigmaFileOrNodeIdType.nodeid:
      case FigmaFileOrNodeIdType.maybe_fileid:
      case FigmaFileOrNodeIdType.maybe_nodeid: {
        validate(input);
      }
    }
  };

  const validate = (url: string) => {
    try {
      const parsed = parseFileAndNodeId(url);
      parsed.file;
      parsed.node;
      showFigmaAuthModal();
    } catch (e) {}
  };

  const onchange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    validate(val);
    setInput(val);
  };

  return (
    <Container
      key="cta-area"
      whileHover={{
        scale: 1.03,
      }}
    >
      <HeroPrimaryInput onChange={onchange} onSubmit={onSubmit} />
      <HeroPrimaryButton onClick={onSubmit} />
    </Container>
  );
}

const Container = styled(motion.div)`
  padding-top: 24px;
  padding-bottom: 24px;
  align-self: stretch;
  justify-content: flex-start;
  display: flex;
  align-items: start;
  flex: none;
  gap: 14px;

  ${props => media((props.theme as ThemeInterface).breakpoints[3])} {
    flex-direction: row;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[2],
      (props.theme as ThemeInterface).breakpoints[3],
    )} {
    flex-direction: row;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[1],
      (props.theme as ThemeInterface).breakpoints[2],
    )} {
    flex-direction: row;
  }

  ${props =>
    media(
      (props.theme as ThemeInterface).breakpoints[0],
      (props.theme as ThemeInterface).breakpoints[1],
    )} {
    flex-direction: row;
  }

  ${props => media("0px", (props.theme as ThemeInterface).breakpoints[0])} {
    flex-direction: column;
    flex: 1;
    align-self: stretch;
  }
`;
