import React, { useEffect, useState } from "react";
import {
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { Result } from "@designto/code";
import { useTargetContainer } from "hooks/use-target-node";
import { useWorkspaceState } from "core/states";
import { MonacoEditor } from "components/code-editor";
import { ClipboardBox } from "components/inspector";
import { Button } from "@editor-ui/button";
import { useDispatch } from "core/dispatch";
import { code as wwcode } from "../code/code-worker-messenger";
import { CircularProgress } from "@mui/material";
import { ReflectSceneNode } from "@design-sdk/figma-node";
import { copy } from "utils/clipboard";
import styled from "@emotion/styled";

export function CodeSection() {
  const wstate = useWorkspaceState();
  const { target, root } = useTargetContainer();
  const [result, setResult] = useState<Result>(null);
  const dispatch = useDispatch();

  const on_result = (result: Result) => {
    setResult(result);
  };

  const on_open = () => {
    dispatch({ type: "mode", mode: "code" });
  };

  useEffect(() => {
    // clear data.
    setResult(null);

    if (!target) {
      return;
    }

    wwcode({
      target: target.id,
      framework: wstate.preferences.framework_config,
    }).then(on_result);
  }, [target?.id]);

  const { code } = result ?? {};
  const viewheight = target?.isRoot ? 800 : 400;

  if (!target) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Code</h6>
        <Button id="open-code-editor" onClick={on_open}>
          Open Code editor
        </Button>
      </PropertyGroupHeader>
      <CliIntegrationSnippet node={target} />
      {code ? (
        <>
          <MonacoEditor
            readonly
            width={"100%"}
            value={code.raw}
            height={viewheight}
            fold_comments_on_load
            options={{
              lineNumbers: "off",
              glyphMargin: false,
              minimap: { enabled: false },
            }}
          />
        </>
      ) : (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: viewheight,
          }}
        >
          <CircularProgress size={24} />
        </div>
      )}
    </PropertyGroup>
  );
}

function CliIntegrationSnippet({ node }: { node: ReflectSceneNode }) {
  const { id, filekey } = node;
  const snippet = `grida add "${String(filekey).substring(0, 5)}/${id}"`;
  const actualcmd = `grida add "https://www.figma.com/file/${String(
    filekey
  )}/${id}"`;

  const onclick = () => {
    copy(actualcmd, { notify: true });
  };

  return (
    <PropertyLines>
      <ClipboardBox
        background="black"
        borderRadius={8}
        onClick={onclick}
        singleline
      >
        <CodeLine
          title={actualcmd}
          style={{ color: "white", wordBreak: "keep-all" }}
        >
          $ {snippet}
        </CodeLine>
      </ClipboardBox>
    </PropertyLines>
  );
}

const CodeLine = styled.span`
  display: inline-block;
  font-family: "Courier New", Courier, monospace;
`;
