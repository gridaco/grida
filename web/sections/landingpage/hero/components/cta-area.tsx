import {
  analyze,
  parseFileAndNodeId,
  FigmaUrlType,
  FigmaFileOrNodeIdType,
} from "@design-sdk/figma-url/dist";
import styled from "@emotion/styled";
import { motion } from "framer-motion";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Flex } from "rebass";

import { usePopupContext } from "utils/context/PopupContext";
import {
  getFigmaAccessToken__localstorage,
  startAnonymousFigmaAccessTokenOneshot,
  _FIGMA_ACCESS_TOKEN_STORAGE_KEY,
} from "utils/instant-demo/figma-anonymous-auth";
import { media } from "utils/styled/media";
import { ThemeInterface } from "utils/styled/theme";

import { HeroPrimaryButton } from "./hero-primary-button";
import { HeroPrimaryInput } from "./hero-primary-input";

export function CtaArea() {
  const inputRef = React.createRef<HTMLInputElement>();

  const [hasOngoingAuthProc, setHasOngoingAuthProc] = useState(false);
  const [input, setInput] = useState<string>(null);
  const { addPopup, removePopup } = usePopupContext();
  const [isFigmaAccessProvided, setIsFigmaAccessProvided] = useState(false);

  useEffect(() => {
    const check = () => {
      const tokeninfo = getFigmaAccessToken__localstorage();
      const accesstoken = tokeninfo && tokeninfo.accessToken;
      if (accesstoken) {
        // console.log("got figma access token", accesstoken);
        setIsFigmaAccessProvided(true);
      }
    };

    const _ = e => {
      if (e.key == _FIGMA_ACCESS_TOKEN_STORAGE_KEY) {
        check();
      }
    };

    // check once
    check();

    // check again when storage changes
    window.addEventListener("storage", _);

    return () => {
      window.removeEventListener("storage", _);
    };
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
              const w = window.open(
                oauthurl,
                "authenticate",
                "popup, location=no, status=no, menubar=no, width=620, height=600",
              );
              w.focus();
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
    if (input == null || input.trim() === "") {
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
      if (parsed) {
        // parsed.file;
        // parsed.node;
        inputRef?.current?.blur();
        if (isFigmaAccessProvided) {
          // TODO:
          moveToCode({
            figmaAccessToken: getFigmaAccessToken__localstorage().accessToken,
            design: url,
          });
          // console.log("figma access token is already provided!", url);
        } else {
          showFigmaAuthModal();
        }
      }
    } catch (e) {
      console.error("error while validating figma url", e);
    }
  };

  const moveToCode = (p: { figmaAccessToken: string; design: string }) => {
    const q = {
      fat: p.figmaAccessToken,
      design: p.design,
    };
    const url = new URL("https://code.grida.co/to-code");
    url.searchParams.append("design", q.design);
    url.searchParams.append("fat", q.fat);

    window.open(url.toString(), "_blank");
    // after opening a new window, clear the input.

    setInput("");
    inputRef.current.value = "";
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
        ref={inputRef}
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
