import React, { useEffect, useState } from "react";
import styled from "@emotion/styled";
import { getParameters } from "codesandbox/lib/api/define";
import axios from "axios";
import { useAsyncEffect } from "../../hooks";

/**
 * Codesandbox view on iframe for development result view purpose
 * @param props
 * @returns
 */
export function CodeSandBoxView(props: { source: string }) {
  const [iframeUrl, setIframeUrl] = useState("");
  useAsyncEffect(async () => {
    const parameters = getParameters({
      files: {
        "index.js": {
          content: props.source,
          isBinary: false,
        },
        // "package.json": {
        //   content: "",
        //   isBinary: false,
        // },
      },
      template: "create-react-app-typescript",
    });

    const {
      data: { sandbox_id },
    } = await axios.post(
      // api docs https://codesandbox.io/docs/api
      `https://codesandbox.io/api/v1/sandboxes/define?json=1&parameters=${parameters}`
    );

    setIframeUrl(
      // embed options https://codesandbox.io/docs/embedding
      `https://codesandbox.io/embed/${sandbox_id}?editorsize=0&hidenavigation=1&codemirror=1&theme=light&previewwindow=browser&view=preview&expanddevtools=1`
    );
  }, []);

  return (
    <Wrapper>
      <iframe src={iframeUrl} />
    </Wrapper>
  );
}

const Wrapper = styled.div`
  iframe {
    position: absolute;
    right: 0;
    width: 50%;
    height: 100%;
    border: none;
  }
`;
