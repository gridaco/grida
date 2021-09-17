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
export function CodeSandBoxView(props: {
  src: string;
  componentName: string;
  width: number | string;
  height: number | string;
}) {
  const [iframeUrl, setIframeUrl] = useState("");
  const parameters = getParameters({
    files: {
      "App.tsx": {
        content: props.src,
        isBinary: false,
      },
      "index.tsx": {
        content: `
import React from "react";
import { render } from "react-dom";

import ${props.componentName} from "./App";

const rootElement = document.getElementById("root");
render(<${props.componentName} />, rootElement);
`,
        isBinary: false,
      },
      "tsconfig.json": {
        content: `
{
    "include": [
        "./src/**/*"
    ],
    "compilerOptions": {
        "strict": true,
        "esModuleInterop": true,
        "lib": [
            "dom",
            "es2015"
        ],
        "jsx": "react-jsx"
    }
}`,
        isBinary: false,
      },
      "package.json": {
        content: `
{
  "name": "react-typescript",
  "version": "1.0.0",
  "description": "React and TypeScript example starter project",
  "keywords": [
    "typescript",
    "react",
    "starter"
  ],
  "main": "src/index.tsx",
  "dependencies": {
    "react": "17.0.2",
    "react-dom": "17.0.2",
    "react-scripts": "4.0.0",
    "@emotion/react": "^11.1.5",
    "@emotion/styled": "^11.1.5"
  },
  "devDependencies": {
    "@types/react": "17.0.0",
    "@types/react-dom": "17.0.0",
    "typescript": "4.1.3"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test --env=jsdom",
    "eject": "react-scripts eject"
  },
  "browserslist": [
    ">0.2%",
    "not dead",
    "not ie <= 11",
    "not op_mini all"
  ]
}`,
        isBinary: false,
      },
    },
    template: "create-react-app-typescript",
  });

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
  if (parameters.length > 2083 /*max url len*/) {
    mode = "large";
  }

  switch (mode) {
    case "moderate": {
      return (
        await axios.post<{ sandbox_id }>(
          // api docs https://codesandbox.io/docs/api
          `https://codesandbox.io/api/v1/sandboxes/define?json=1&parameters=${parameters}`
        )
      ).data;
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
