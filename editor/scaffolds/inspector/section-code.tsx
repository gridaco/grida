import React, { useCallback, useEffect, useState } from "react";
import {
  PropertyLines,
  PropertyGroup,
  PropertyGroupHeader,
} from "@editor-ui/property";
import { Result } from "@designto/code";
import { useTargetContainer } from "hooks/use-target-node";
import { MonacoEditor } from "components/code-editor";
import { ClipboardBox } from "components/inspector";
import { useDispatch } from "core/dispatch";
import { code as wwcode } from "../code/code-worker-messenger";
import { CircularProgress } from "@mui/material";
import { ReflectSceneNode } from "@design-sdk/figma-node";
import { copy } from "utils/clipboard";
import styled from "@emotion/styled";
import { GearIcon, CodeIcon } from "@radix-ui/react-icons";
import { useOpenPreferences, usePreferences } from "@code-editor/preferences";

export function CodeSection() {
  const { config: preferences } = usePreferences();
  const { target, root } = useTargetContainer();
  const [result, setResult] = useState<Result>(null);
  const dispatch = useDispatch();

  const on_result = (result: Result) => {
    setResult(result);
  };

  const onOpenClick = useCallback(() => {
    dispatch({
      type: "coding/new-template-session",
      template: {
        type: "d2c",
        target: target.id,
      },
    });
  }, [target?.id, dispatch]);

  const onOpenConfigClick = useOpenPreferences("/framework");

  useEffect(() => {
    // clear data.
    setResult(null);

    if (!target) {
      return;
    }

    if (!preferences.framework) {
      return;
    }

    wwcode({
      target: target.id,
      framework: preferences.framework,
    }).then(on_result);
  }, [target?.id, preferences.framework.framework]);

  const { code } = result ?? {};
  const viewheight = target?.isRoot ? 800 : 400;

  if (!target) {
    return <></>;
  }

  return (
    <PropertyGroup>
      <PropertyGroupHeader>
        <h6>Code</h6>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <IconButton onClick={onOpenClick}>
            <CodeIcon color="white" />
          </IconButton>
          <IconButton onClick={onOpenConfigClick}>
            <GearIcon color="white" />
          </IconButton>
        </div>
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
              showFoldingControls: "mouseover",
              guides: {
                indentation: false,
                highlightActiveIndentation: false,
              },
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
          <span className="bash">➜</span> {snippet}
        </CodeLine>
      </ClipboardBox>
    </PropertyLines>
  );
}

const CodeLine = styled.span`
  display: inline-block;
  font-family: "Courier New", Courier, monospace;

  .bash {
    color: green;
  }
`;

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
  padding: 8px;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  &:active {
    background: rgba(255, 255, 255, 0.2);
  }
`;
