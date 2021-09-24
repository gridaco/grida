import React from "react";
import { CodeSandBoxView } from "./code-sandbox-runner";

export function ReactAppRunner(props: {
  source: string;
  width: string | number;
  height: string | number;
  componentName: string;
}) {
  return (
    <>
      <CodeSandBoxView
        sandbox={{
          files: {
            "App.tsx": {
              content: props.source,
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
        }}
        width={props.width}
        height={props.height}
      />
    </>
  );
}
