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
import { startAnonymousFigmaAccessTokenOneshot } from "utils/instant-demo/figma-anonymous-auth";
import { signup_callback_redirect_uri } from "utils/landingpage/constants";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import { HeroPrimaryButton } from "./hero-primary-button";
import { HeroPrimaryInput } from "./hero-primary-input";

export function CtaArea() {
  const [hasOngoingAuthProc, setHasOngoingAuthProc] = useState(false);
  const [input, setInput] = useState<string>(null);
  const { addPopup, removePopup } = usePopupContext();

  const showSimpleDialog = useCallback((msg: string | JSX.Element) => {
    addPopup({
      title: "",
      element: (
        <Flex
          width="calc(100vw - 40px)"
          alignItems="center"
          flexDirection="column"
          p="48px"
        >
          {msg}
        </Flex>
      ),
    });
  }, []);

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
          <p style={{ textAlign: "center" }}>
            Please Enter a valid figma file url.
            {/* TODO: update docs url */}
            <br />
            <a href="https://grida.co/docs/" target="_blank">
              How do i get one?
            </a>
          </p>
        </Flex>
      ),
    });
  }, []);

  // const _cb =
  //   process.env.NODE_ENV === "development"
  //     ? "http://localhost:3000/figma-instant-auth-callback"
  //     : "https://grida.co/figma-instant-auth-callback";
  // const oauthurl = `https://www.figma.com/oauth?client_id=USz3HnKVO6Y2HUED98ZEzf&redirect_uri=${_cb}&scope=file_read&state=:state&response_type=code`;
  // const oauthurl = `https://accounts.grida.co/signin?redirect_uri=/tunnel?command=connect-figma`;

  const showFigmaAuthModal = useCallback(async () => {
    setHasOngoingAuthProc(true);
    const oauthurl = await (await startAnonymousFigmaAccessTokenOneshot()).url;
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
      onDismiss: () => {
        setHasOngoingAuthProc(false);
      },
    });
  }, []);

  const onSubmit = () => {
    if (input == null) {
      showInvalidUrlGuide();
      return;
    }

    /// TODO:
    try {
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
        default: {
          showInvalidUrlGuide();
        }
      }
    } catch (e) {
      showInvalidUrlGuide();
    }
  };

  const validate = (url: string) => {
    if (hasOngoingAuthProc) {
      return;
    }
    try {
      const parsed = parseFileAndNodeId(url);
      parsed.file;
      parsed.node;
      showFigmaAuthModal();
    } catch (e) {}
  };

  const onchange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/(\r\n|\n|\r)/gm, ""); // remove all spaces
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
      <HeroPrimaryInput
        placeholder={"Enter your Figma design url"}
        onChange={onchange}
        onSubmit={onSubmit}
      />
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
