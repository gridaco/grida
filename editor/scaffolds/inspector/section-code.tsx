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
import { colors } from "theme";

/**
 * a debounced state for hiding the monaco view, since it blinks after loading
 */
function useExtraLoading(result: Result | null, delay = 800) {
  const [loading, setLoading] = useState(true);

  // set loading to false after delay, if result is givven.
  useEffect(() => {
    if (!result?.code) {
      return;
    }

    const timer = setTimeout(() => {
      setLoading(false);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [result?.code]);

  // reset loading to true on result change.
  useEffect(() => {
    setLoading(true);
  }, [result?.code]);

  return loading;
}

export function CodeSection() {
  const { config: preferences } = usePreferences();
  const { target, root } = useTargetContainer();
  const [result, setResult] = useState<Result>(null);
  const loading = useExtraLoading(result);

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

    setTimeout(() => {
      // execute after 500 ms for better ux (render the ui smoothly first).
      // it uses the webworker but, still heavy operations holds the ui thread.
      wwcode({
        target: target.id,
        framework: preferences.framework,
      }).then(on_result);
    }, 500);
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
      <CodeView
        style={{
          height: viewheight,
        }}
      >
        <div className="loading-overlay" data-loading={loading}>
          <CircularProgress size={24} />
        </div>
        <MonacoEditor
          readonly
          width={"100%"}
          value={code?.raw}
          height={"100%"}
          fold_comments_on_load
          path={dummy_file_name_map[preferences.framework.framework]}
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
      </CodeView>
    </PropertyGroup>
  );
}

const CodeView = styled.div`
  position: relative;

  .loading-overlay {
    user-select: none;
    pointer-events: none;
    background-color: ${colors.color_editor_bg_on_dark};
    position: absolute;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    width: 100%;
    z-index: 9;
    opacity: 1;

    &[data-loading="false"] {
      opacity: 0;
      transition: opacity 0.2s ease-in-out;
    }

    &[data-loading="true"] {
      opacity: 1;
    }
  }
`;

const dummy_file_name_map = {
  flutter: "main.dart",
  react: "app.tsx",
  "react-native": "app.tsx",
  vue: "app.vue",
} as const;

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
