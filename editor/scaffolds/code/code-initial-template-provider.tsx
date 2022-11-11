import { useDispatch } from "core/dispatch";
import { useEditorState } from "core/states";
import React, { useEffect } from "react";
import { useCode } from "./hooks/use-code";

/**
 * This is a component that manages the initial code generation, since the d2c proc is async.
 * Once the code mode is enabled with desired target, this component will generate the code, then provide the initial files & modules to the editor state.
 *
 * The children including the code editor (monaco) will consume then.
 */
export function CodeInitialTemplateProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  const dispath = useDispatch();

  const result = useCode();

  useEffect(() => {
    if (result) {
      dispath({
        type: "coding/initial-seed",
        // todo:
        files: {
          "/index.html": {
            name: "index.html",
            path: "/index.html",
            type: "text/html",
            content: index_html,
          },
          "/app.tsx": {
            name: "app.tsx",
            path: "/app.tsx",
            type: "application/typescriptreact",
            content: app_tsx(result.name),
          },
          "/component.tsx": {
            name: "component.tsx",
            path: "/component.tsx",
            type: "application/typescriptreact",
            content: result.scaffold.raw,
          },
        },
        open: "*",
        focus: "/component.tsx",
      });
    }
  }, [result]);

  return <>{children}</>;
}

const index_html = '<div id="root"></div>';

const app_tsx = (n) => {
  return `import React from 'react';
import ReactDOM from 'react-dom';
import { ${n} } from './component';

const App = () => <${n}/>

ReactDOM.render(<App />, document.querySelector('#root'));
`;
};
