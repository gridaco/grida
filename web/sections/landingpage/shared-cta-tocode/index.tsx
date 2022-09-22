import {
  analyze,
  parseFileAndNodeId,
  FigmaUrlType,
  FigmaFileOrNodeIdType,
  FigmaTargetNodeConfig,
} from "@design-sdk/figma-url/dist";
import { event_cta__to_code } from "analytics";
import React, { useCallback, useEffect, useState } from "react";
import { Flex } from "theme-ui";

import { usePopupContext } from "utils/context/PopupContext";
import {
  clearFigmaAccessToken__localstorage,
  getFigmaAccessToken__localstorage,
  startAnonymousFigmaAccessTokenOneshot,
  _FIGMA_ACCESS_TOKEN_STORAGE_KEY,
} from "utils/instant-demo/figma-anonymous-auth";

import {
  MagicInput,
  MagicButton,
  MagicCtaContainer,
} from "../cta-see-the-magic/components";
import {
  HeroCtaContainer,
  HeroPrimaryButton,
  HeroPrimaryInput,
} from "../hero/components";
import { FigmaAuthDoneModalContents } from "./modal-content-figma-auth-done";
import { FigmaAuthModalContents } from "./modal-content-figma-auth-prompt";
import { ModalInvalidInputContentBody } from "./modal-content-invalid-input";

type CtaOrigin = "hero-cta" | "footer-cta";

export function CtaArea({ mode }: { mode: CtaOrigin }) {
  const inputRef = React.createRef<HTMLInputElement>();

  const [hasOngoingAuthProc, setHasOngoingAuthProc] = useState(false);
  const [input, setInput] = useState<string>(null);
  const { addPopup, removePopup } = usePopupContext();

  const showInvalidUrlGuide = useCallback(() => {
    addPopup({
      title: "",
      element: (
        <Flex
          style={{
            width: "calc(100vw - 40px)",
            alignItems: "center",
            flexDirection: "column",
          }}
          p="48px"
        >
          <ModalInvalidInputContentBody />
        </Flex>
      ),
    });
  }, []);

  const showFigmaAuthModal = useCallback(
    async ({ afterurl }: { afterurl: string }) => {
      setHasOngoingAuthProc(true);

      // log event
      event_cta__to_code({
        step: "authenticate-with-figma",
        input: afterurl,
        origin: mode,
      });

      addPopup({
        title: "",
        element: (
          <FigmaAuthModal
            onNextClick={() => {
              setHasOngoingAuthProc(false);
              validate(afterurl);
            }}
          />
        ),
        onDismiss: () => {
          setHasOngoingAuthProc(false);
        },
      });
    },
    [],
  );

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
        // log event
        event_cta__to_code({
          step: "input-and-validate",
          input: url,
          origin: mode,
        });

        inputRef?.current?.blur();
        isAccessTokenValid().then(valid => {
          if (valid) {
            moveToCode({
              figmaAccessToken: getFigmaAccessToken__localstorage().accessToken,
              target: parsed,
            });
          } else {
            showFigmaAuthModal({
              afterurl: url,
            });
          }
        });
      }
    } catch (e) {
      console.error("error while validating figma url", e);
    }
  };

  const moveToCode = ({
    figmaAccessToken,
    target,
  }: {
    figmaAccessToken: string;
    target: FigmaTargetNodeConfig;
  }) => {
    // log event
    event_cta__to_code({
      step: "submit-and-move",
      input: target.url,
      origin: mode,
    });
    const q = {
      fat: figmaAccessToken,
      figma: "1",
      node: target.node,
    };
    const url = new URL(`https://code.grida.co/files/${target.file}`);
    // set the design platform
    url.searchParams.append("figma", "1");
    // set the target node if available
    q.node && url.searchParams.append("node", q.node);
    // set figma access token (will be replaced with cookie)
    url.searchParams.append("fat", q.fat);

    window.open(url.toString(), "_blank");
    // after opening a new window, clear the input.

    inputRef?.current && (inputRef.current.value = "");
    setInput("");
  };

  const onchange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/(\r\n|\n|\r)/gm, ""); // remove all spaces
    setInput(val);
    validate(val);
  };

  switch (mode) {
    case "hero-cta": {
      return (
        <>
          <HeroCtaContainer
            key="cta-area"
            whileHover={{
              scale: 1.03,
            }}
          >
            <HeroPrimaryInput
              ref={inputRef}
              onChange={onchange}
              onSubmit={onSubmit}
            />
            <HeroPrimaryButton onClick={onSubmit} />
          </HeroCtaContainer>
        </>
      );
    }
    case "footer-cta": {
      return (
        <MagicCtaContainer>
          <MagicInput ref={inputRef} onChange={onchange} onSubmit={onSubmit} />
          <MagicButton onClick={onSubmit} />
        </MagicCtaContainer>
      );
    }
  }
}

const FigmaAuthModal = ({ onNextClick }: { onNextClick: () => void }) => {
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

  const onclick = async () => {
    const oauthurl = await (await startAnonymousFigmaAccessTokenOneshot()).url;
    const w = window.open(
      oauthurl,
      "authenticate",
      "popup, location=no, status=no, menubar=no, width=620, height=600",
    );
    w.focus();
  };

  return (
    <Flex
      style={{
        width: "calc(100vw - 40px)",
        alignItems: "center",
        flexDirection: "column",
      }}
      p="48px"
    >
      {isFigmaAccessProvided ? (
        <FigmaAuthDoneModalContents onClick={onNextClick} />
      ) : (
        <FigmaAuthModalContents onClick={onclick} />
      )}
    </Flex>
  );
};

async function isAccessTokenValid() {
  const clearExpired = () => {
    clearFigmaAccessToken__localstorage();
  };

  const tokeninfo = getFigmaAccessToken__localstorage();
  const accesstoken = tokeninfo && tokeninfo.accessToken;
  if (accesstoken) {
    try {
      const res = await fetch(`https://api.figma.com/v1/me`, {
        method: "GET",
        headers: new Headers({
          Authorization: "Bearer " + accesstoken,
        }),
      });

      if (res.status >= 400) {
        clearExpired();
        return false;
      }
      return true;
    } catch (e) {
      clearExpired();
      return false;
    }
  }
  clearExpired();
  return false;
}
