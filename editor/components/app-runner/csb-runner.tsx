import React, { useState } from "react";
import { getParameters } from "codesandbox/lib/api/define";
import { IFiles } from "codesandbox-import-utils/lib/api/define";
import axios from "axios";
import { useAsyncEffect } from "hooks";

type CSB_Template =
  | "adonis"
  | "vue-cli"
  | "preact-cli"
  | "svelte"
  | "create-react-app-typescript"
  | "create-react-app"
  | "angular-cli"
  | "parcel"
  | "@dojo/cli-create-app"
  | "cxjs"
  | "gatsby"
  | "nuxt"
  | "next"
  | "reason"
  | "apollo"
  | "sapper"
  | "ember"
  | "nest"
  | "static"
  | "styleguidist"
  | "gridsome"
  | "vuepress"
  | "mdx-deck"
  | "quasar"
  | "docusaurus"
  | "node";

/**
 * Codesandbox view on iframe for development result view purpose
 * @param props
 * @returns
 */
export function CodeSandBoxView(props: {
  sandbox: { files: IFiles; template: CSB_Template };
  width: number | string;
  height: number | string;
}) {
  const sandbox_params = props.sandbox;
  const [iframeUrl, setIframeUrl] = useState("");
  const parameters = getParameters(sandbox_params);

  useAsyncEffect(async () => {
    const data = await post_create_sandbox(parameters);
    if (data !== "large") {
      setIframeUrl(
        // embed options https://codesandbox.io/docs/embedding
        `https://codesandbox.io/embed/${data.sandbox_id}?editorsize=0&hidenavigation=1&codemirror=1&theme=light&previewwindow=browser&view=preview&expanddevtools=1`
      );
    }
  }, []);

  if (iframeUrl) {
    return (
      <iframe
        src={iframeUrl}
        style={{
          width: props.width,
          height: props.height,
        }}
      />
    );
  } else {
    return (
      <form
        style={{ margin: 12 }}
        action="https://codesandbox.io/api/v1/sandboxes/define"
        method="POST"
        target="_blank"
      >
        <input type="hidden" name="parameters" value={parameters} />
        <p>
          <b>Payload is too large.</b>
          <br />
          Codesandbox does not support embedding a large payload sandbox. you
          have to click below button to run as sandbox.
        </p>
        <input type="submit" value="Open in sandbox" />
      </form>
    );
  }
}

async function post_create_sandbox(
  parameters: string,
  mode: "large" | "moderate" = "moderate"
) {
  switch (mode) {
    case "moderate": {
      try {
        return (
          await axios.post<{ sandbox_id }>(
            // api docs https://codesandbox.io/docs/api
            `https://codesandbox.io/api/v1/sandboxes/define?json=1&parameters=${parameters}`
          )
        ).data;
      } catch (_) {
        return "large";
      }
    }
    case "large": {
      await Promise.resolve();
      return "large";
      // this only works with user-triggered for request.
      // the api will work, but won't redirect with CORS blocked.
      // await axios.post<{ sandbox_id }>(
      //   "https://cors.bridged.cc/" +
      //     "https://codesandbox.io/api/v1/sandboxes/define",
      //   { parameters: parameters }
      // );
    }

    // we still can host the files and use the binary loading reference, but for now, we'll ues user triggered form request instead.
  }
}
